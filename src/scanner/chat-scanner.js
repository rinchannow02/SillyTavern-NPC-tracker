/**
 * @file src/scanner/chat-scanner.js
 * @description LLM Chat Scanner and Entity Extraction Pipeline for SillyTavern-NPC-tracker.
 */

import {
    createNpc,
    updateNpc,
    getNpcById,
    parseBlocks,
    resolveScopeTarget,
    getActiveContextNpcs,
    DEFAULT_BLOCKS,
} from '../db/sqlite-store.js';

import { syncPromptInjection } from '../injection.js';

export const DEFAULT_EXTRACTION_PROMPT = `Extract any newly introduced or updated secondary/tertiary NPCs from the recent roleplay messages.
Do NOT extract the main user persona or the primary character.
Only account for NPCs that regularly appear or actively interact in the story (ignore one-off background mentions, bystanders, or minor figures who barely interact).

For each NPC found, output a JSON array of objects with the following keys:
- "name": string (Full or recognized name of the NPC)
- "aliases": string (Comma-separated nicknames, titles, or aliases, e.g. "Barkeep, Chief", or empty string)
- "group_name": string (Faction, department, or establishment, e.g. "Mirai Industries IT", or empty string)
- "location_keywords": string (Comma-separated setting keywords where this NPC appears, e.g. "basement, office", or empty string)
- "appearance": string (ONLY physical traits and attire, concise list/tags: e.g. "woman, tall, heels, dark suit, flat expression")
- "personality": string (Concise behavioral tags or simple description for roleplay execution: e.g. "deadpan, authoritative, dry humor, monotone, protective")
- "relationship": string (Concise character pairings formatted like "Character 1 - Role, Character 2 - Role", e.g. "Nanaka - Supervisor, Sunny - Companion, Wisdom - Subordinate")

Output ONLY the valid JSON array inside a \`\`\`json\`\`\` code block without preamble or explanation:
\`\`\`json
[
  {
    "name": "NPC Name",
    "aliases": "Alias",
    "group_name": "Group",
    "location_keywords": "location",
    "appearance": "man, tall, black hair, lab coat",
    "personality": "cynical, brilliant, speaks fast, impatient",
    "relationship": "Character 1 - Colleague, Character 2 - Supervisor"
  }
]
\`\`\``;

/**
 * Returns available ST Connection Profiles for routing.
 * @returns {Array<{id: string, name: string}>}
 */
export function getConnectionProfiles() {
    try {
        const context = (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) ? SillyTavern.getContext() : {};
        const ext = context.extensionSettings || (typeof window !== 'undefined' ? window.extension_settings : null) || {};
        const cm = ext.connectionManager || ext.connection_manager;
        let profiles = cm?.profiles;

        if ((!profiles || (Array.isArray(profiles) && profiles.length === 0)) && context.ConnectionManagerRequestService?.getSupportedProfiles) {
            try {
                profiles = context.ConnectionManagerRequestService.getSupportedProfiles();
            } catch (_) {}
        }

        if (Array.isArray(profiles) && profiles.length > 0) {
            return profiles.map((p) => ({
                id: p.id || p.name,
                name: p.name || p.id,
            }));
        }
        if (profiles && typeof profiles === 'object' && Object.keys(profiles).length > 0) {
            return Object.entries(profiles).map(([key, val]) => ({
                id: val?.id || key,
                name: val?.name || key,
            }));
        }
    } catch (err) {
        console.debug('[NPC Tracker] Could not enumerate connection profiles:', err);
    }
    return [];
}

let scanning = false;

/**
 * Executes chat extraction by routing to either ConnectionManagerRequestService or active ST API.
 * @param {Object} [options]
 * @param {number} [options.scanDepth]
 * @param {number} [options.maxTokens]
 * @param {number} [options.temperature]
 * @param {string} [options.connectionProfileId]
 * @param {string} [options.customPrompt]
 * @param {string} [options.updateMode]
 * @returns {Promise<{extracted: Array<Object>, created: number, updated: number}>}
 */
export async function scanRecentChat(options = {}) {
    if (scanning) {
        console.warn('[NPC Tracker] Scan already in progress. Skipping concurrent request.');
        return { extracted: [], created: 0, updated: 0, skipped: true };
    }
    scanning = true;
    try {
        const context = SillyTavern.getContext();
        const settings = context.extensionSettings?.['npc_tracker'] || {};
        const scannerSettings = settings.scanner || {};

        const scanDepth = options.scanDepth ?? scannerSettings.scanDepth ?? 10;
        const profileId = options.connectionProfileId ?? scannerSettings.connectionProfileId ?? '';
        const maxTokens = Math.min(8192, Math.max(100, parseInt(options.maxTokens ?? scannerSettings.maxTokens ?? 800, 10)));
        const rawTemp = parseFloat(options.temperature ?? scannerSettings.temperature);
        const temperature = Number.isFinite(rawTemp) ? Math.min(2.0, Math.max(0.0, rawTemp)) : 0.2;
        const updateMode = options.updateMode ?? scannerSettings.updateMode ?? 'merge_existing';
        const basePrompt = options.customPrompt || scannerSettings.customPrompt || DEFAULT_EXTRACTION_PROMPT;

    // 1. Gather recent messages from chat
    const chat = context.chat || [];
    if (!Array.isArray(chat) || chat.length === 0) {
        throw new Error('No messages available in current chat context to scan.');
    }

    const recentSlice = chat.slice(-Math.max(1, scanDepth));
    const formattedChatHistory = recentSlice
        .map((msg) => {
            const sender = msg.name || (msg.is_user ? context.name1 || 'User' : context.name2 || 'Character');
            return `${sender}: ${msg.mes || ''}`;
        })
        .join('\n\n');

    const fullPrompt = `${basePrompt}\n\n### RECENT CHAT MESSAGES:\n${formattedChatHistory}`;

    console.log(`[NPC Tracker] Scanning last ${recentSlice.length} messages for NPCs (Profile: ${profileId || 'Active ST API'}, maxTokens: ${maxTokens}, temp: ${temperature})...`);

    let rawResponse = '';

    // 2. Route LLM Request
    if (profileId && context.ConnectionManagerRequestService) {
        try {
            console.log(`[NPC Tracker] Routing extraction via Connection Profile: ${profileId}`);
            const result = await context.ConnectionManagerRequestService.sendRequest(
                profileId,
                fullPrompt,
                maxTokens,
                { stream: false, extractData: true },
                { temperature, max_tokens: maxTokens }
            );

            if (typeof result === 'string') {
                rawResponse = result;
            } else if (result && typeof result === 'object') {
                rawResponse = result.content ?? result.text ?? result.message ?? JSON.stringify(result);
            }
        } catch (err) {
            throw new Error(`[NPC Tracker] Connection profile "${profileId}" request failed: ${err.message}`);
        }
    } else {
        rawResponse = await requestViaActiveApi(fullPrompt, maxTokens, temperature);
    }

    if (!rawResponse || typeof rawResponse !== 'string') {
        throw new Error('Received empty response from extraction LLM.');
    }

    // 3. Parse JSON extraction
    const extractedList = parseExtractionResponse(rawResponse);
    if (!Array.isArray(extractedList) || extractedList.length === 0) {
        console.log('[NPC Tracker] No new NPCs detected in recent messages.');
        return { extracted: [], created: 0, updated: 0 };
    }

    console.log(`[NPC Tracker] Extracted ${extractedList.length} candidate NPC(s) from chat:`, extractedList.map((e) => e.name));

    // 4. Merge or Create into SQLite
    let createdCount = 0;
    let updatedCount = 0;

    const targetScope = settings.defaultScope || 'chat';
    const targetId = resolveScopeTarget(targetScope, context) || resolveScopeTarget('chat', context) || 'default_chat';

    for (const item of extractedList) {
        if (!item.name || typeof item.name !== 'string' || !item.name.trim()) continue;

        const cleanName = item.name.trim();
        const existing = findExistingNpc(cleanName, item.aliases);

        const blocks = DEFAULT_BLOCKS.map((b) => ({
            ...b,
            value: item[b.id] || '',
        }));

        if (existing) {
            if (updateMode === 'create_new_only') {
                continue;
            }

            // Merge details: only fill fields that are empty; never overwrite non-empty user data
            const mergedBlocks = Array.isArray(existing.blocks) ? [...existing.blocks] : [];
            for (const b of blocks) {
                const targetIdx = mergedBlocks.findIndex((mb) => mb.id === b.id);
                if (targetIdx !== -1) {
                    if (!mergedBlocks[targetIdx].value && b.value) {
                        mergedBlocks[targetIdx].value = b.value;
                    }
                } else if (b.value) {
                    mergedBlocks.push(b);
                }
            }

            updateNpc(existing.id, {
                aliases: existing.aliases || item.aliases || '',
                group_name: existing.group_name || item.group_name || '',
                location_keywords: existing.location_keywords || item.location_keywords || '',
                blocks: mergedBlocks,
            });
            updatedCount++;
        } else {
            createNpc(
                {
                    name: cleanName,
                    aliases: item.aliases || '',
                    group_name: item.group_name || '',
                    location_keywords: item.location_keywords || '',
                    blocks,
                },
                [
                    {
                        scope_type: targetScope,
                        target_id: targetId,
                        relationship_summary: item.relationship || 'Encountered in scene',
                    },
                ]
            );
            createdCount++;
        }
    }

    // 5. Re-synchronize prompt injection
    syncPromptInjection();

        return {
            extracted: extractedList,
            created: createdCount,
            updated: updatedCount,
        };
    } finally {
        scanning = false;
    }
}

/**
 * Requests completion via the active SillyTavern API.
 * @param {string} prompt
 * @param {number} [maxTokens=800]
 * @param {number} [temperature=0.2]
 * @returns {Promise<string>}
 */
async function requestViaActiveApi(prompt, maxTokens = 800, temperature = 0.2) {
    const context = SillyTavern.getContext();

    try {
        if (typeof context.generateRaw === 'function') {
            return await context.generateRaw({
                prompt,
                systemPrompt: 'You are an accurate structured data extraction assistant. Return ONLY valid JSON.',
                responseLength: maxTokens,
                max_tokens: maxTokens,
                temperature,
            });
        }

        if (typeof context.generateQuietPrompt === 'function') {
            return await context.generateQuietPrompt({
                quietPrompt: prompt,
                skipWIAN: true,
                responseLength: maxTokens,
                removeReasoning: false,
            });
        }
    } catch (err) {
        const errText = `${err?.message || ''} ${JSON.stringify(err || {})}`;
        if (errText.includes('Reasoning is mandatory')) {
            throw new Error('The active model (e.g. GLM-5.3-flash) requires reasoning/thinking enabled. Please enable "Show Thoughts" / set reasoning effort in SillyTavern API settings, or select a dedicated Connection Profile in NPC Tracker.');
        }
        throw err;
    }

    throw new Error('Neither generateRaw nor generateQuietPrompt is available in this SillyTavern context.');
}

/**
 * Parses raw LLM text into a structured JSON array of NPC objects.
 * @param {string} rawText
 * @returns {Array<Object>}
 */
export function parseExtractionResponse(rawText) {
    if (!rawText || typeof rawText !== 'string') return [];

    // Attempt 1: Extract JSON from markdown fence (```json ... ``` or ``` ...)
    const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    let candidate = fenceMatch ? fenceMatch[1].trim() : rawText.trim();

    // Attempt 2: Extract JSON array bracket [...] if candidate doesn't start with [ or {
    if (!candidate.startsWith('[') && !candidate.startsWith('{')) {
        const arrayMatch = candidate.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (arrayMatch) {
            candidate = arrayMatch[0];
        } else {
            const objMatch = candidate.match(/\{\s*"(?:npcs|characters)"[\s\S]*\}\s*\}/);
            if (objMatch) {
                candidate = objMatch[0];
            }
        }
    }

    try {
        const parsed = JSON.parse(candidate);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && typeof parsed === 'object') {
            for (const key of Object.keys(parsed)) {
                if (Array.isArray(parsed[key])) return parsed[key];
            }
            if (parsed.name) return [parsed];
        }
    } catch (err) {
        // Fallback: Slice between first '[' and last ']'
        const firstBracket = rawText.indexOf('[');
        const lastBracket = rawText.lastIndexOf(']');
        if (firstBracket !== -1 && lastBracket > firstBracket) {
            try {
                const sub = rawText.substring(firstBracket, lastBracket + 1);
                const parsed = JSON.parse(sub);
                if (Array.isArray(parsed)) return parsed;
            } catch (_) {}
        }
        console.warn('[NPC Tracker] Failed JSON extraction parse:', err.message, '\nRaw text was:\n', rawText);
    }

    return [];
}

/**
 * Locates an existing NPC record by matching name or trigger aliases.
 * @param {string} name
 * @param {string} [aliases]
 * @returns {Object|null}
 */
function findExistingNpc(name, aliases = '') {
    const activeNpcs = getActiveContextNpcs();
    const cleanTargetName = name.toLowerCase().trim();

    for (const npc of activeNpcs) {
        if (npc.name && npc.name.toLowerCase().trim() === cleanTargetName) {
            return {
                ...npc,
                blocks: Array.isArray(npc.blocks) ? npc.blocks : parseBlocks(npc.blocks_json),
            };
        }

        // Check aliases
        if (npc.aliases) {
            const splitAliases = npc.aliases.toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
            if (splitAliases.includes(cleanTargetName)) {
                return {
                    ...npc,
                    blocks: Array.isArray(npc.blocks) ? npc.blocks : parseBlocks(npc.blocks_json),
                };
            }
        }
    }

    return null;
}

/**
 * Evaluates active context NPCs against recent chat text for compound Setting/Location triggers.
 * @param {Array<Object>} activeNpcs
 * @param {number} [depth=4]
 * @returns {Array<Object>} Filtered active NPCs
 */
export function evaluateSettingAwareTriggers(activeNpcs, depthOrText = 4) {
    if (!Array.isArray(activeNpcs) || activeNpcs.length === 0) return [];

    let recentText = '';
    if (typeof depthOrText === 'string') {
        recentText = depthOrText.toLowerCase();
    } else {
        const depth = typeof depthOrText === 'number' ? depthOrText : 4;
        const context = (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) ? SillyTavern.getContext() : {};
        const chat = context.chat || [];
        if (chat.length === 0) return activeNpcs;

        recentText = chat
            .slice(-depth)
            .map((m) => m.mes || '')
            .join(' ')
            .toLowerCase();
    }

    if (!recentText) return activeNpcs;

    // Filter NPCs: return those mentioned by name, alias, or whose location keyword matches
    const triggeredNpcs = activeNpcs.filter((npc) => {
        // If NPC has no location_keywords or aliases, keep it active by default
        if (!npc.location_keywords && !npc.aliases) return true;

        // Check if name is mentioned
        if (npc.name && recentText.includes(npc.name.toLowerCase())) return true;

        // Check if any alias is mentioned
        if (npc.aliases) {
            const aliases = npc.aliases.toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
            if (aliases.some((a) => recentText.includes(a))) return true;
        }

        // Check if location/setting keyword is mentioned
        if (npc.location_keywords) {
            const locs = npc.location_keywords.toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
            if (locs.some((loc) => recentText.includes(loc))) return true;
        }

        return false;
    });

    // If filter filtered out everything, fallback to all active NPCs to prevent context starvation
    return triggeredNpcs.length > 0 ? triggeredNpcs : activeNpcs;
}
