/**
 * @file src/scanner/chat-scanner.js
 * @description LLM Chat Scanner and Entity Extraction Pipeline for SillyTavern-NPC-tracker.
 */

import {
    createNpc,
    updateNpc,
    queryAll,
    getNpcById,
} from '../db/sqlite-store.js';

import { syncPromptInjection } from '../injection.js';

const DEFAULT_EXTRACTION_PROMPT = `Analyze the recent roleplay messages and extract any secondary/tertiary Non-Player Characters (NPCs) mentioned or interacting in the scene.
Do NOT extract the main user persona or the main character.
For each NPC found, output a JSON array of objects with the following keys:
- "name": string (Full or recognized name of the NPC)
- "aliases": string (Comma-separated nicknames, titles, or aliases, e.g. "Barkeep, Gid")
- "group_name": string (Faction, guild, or establishment they belong to, e.g. "Silvermoon Tavern", or empty string)
- "location_keywords": string (Comma-separated location or setting keywords where this NPC appears, e.g. "tavern, docks", or empty string)
- "appearance": string (Physical description, clothes, notable features)
- "personality": string (Demeanor, attitude, speaking style)
- "relationship": string (Affinity or relationship to the main characters/party)

Output ONLY the valid JSON array inside a \`\`\`json\`\`\` code block. Do NOT include any thought process, preamble, or conversational text before or after the JSON:
\`\`\`json
[
  {
    "name": "Example NPC",
    "aliases": "Alias",
    "group_name": "Group",
    "location_keywords": "location",
    "appearance": "Description",
    "personality": "Traits",
    "relationship": "Connection"
  }
]
\`\`\``;

/**
 * Returns available ST Connection Profiles for routing.
 * @returns {Array<{id: string, name: string}>}
 */
export function getConnectionProfiles() {
    try {
        const context = SillyTavern.getContext();
        const profiles = context.extensionSettings?.connection_manager?.profiles;
        if (Array.isArray(profiles)) {
            return profiles.map((p) => ({
                id: p.id || p.name,
                name: p.name || p.id,
            }));
        }
        if (profiles && typeof profiles === 'object') {
            return Object.entries(profiles).map(([key, val]) => ({
                id: key,
                name: val.name || key,
            }));
        }
    } catch (err) {
        console.debug('[NPC Tracker] Could not enumerate connection profiles:', err);
    }
    return [];
}

/**
 * Executes chat extraction by routing to either ConnectionManagerRequestService or active ST API.
 * @param {Object} [options]
 * @param {number} [options.scanDepth]
 * @param {string} [options.connectionProfileId]
 * @param {string} [options.customPrompt]
 * @param {string} [options.updateMode]
 * @returns {Promise<{extracted: Array<Object>, created: number, updated: number}>}
 */
export async function scanRecentChat(options = {}) {
    const context = SillyTavern.getContext();
    const settings = context.extensionSettings?.['npc_tracker'] || {};
    const scannerSettings = settings.scanner || {};

    const scanDepth = options.scanDepth ?? scannerSettings.scanDepth ?? 10;
    const profileId = options.connectionProfileId ?? scannerSettings.connectionProfileId ?? '';
    const updateMode = options.updateMode ?? scannerSettings.updateMode ?? 'merge_existing';
    const basePrompt = options.customPrompt ?? scannerSettings.customPrompt ?? DEFAULT_EXTRACTION_PROMPT;

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

    console.log(`[NPC Tracker] Scanning last ${recentSlice.length} messages for NPCs (Profile: ${profileId || 'Active ST API'})...`);

    let rawResponse = '';

    // 2. Route LLM Request
    if (profileId && context.ConnectionManagerRequestService) {
        try {
            console.log(`[NPC Tracker] Routing extraction via Connection Profile: ${profileId}`);
            rawResponse = await context.ConnectionManagerRequestService.sendRequest(profileId, fullPrompt, 600, {
                temperature: 0.2,
            });
        } catch (err) {
            console.warn(`[NPC Tracker] Connection profile request failed (${err.message}). Falling back to active ST API.`);
            rawResponse = await requestViaActiveApi(fullPrompt);
        }
    } else {
        rawResponse = await requestViaActiveApi(fullPrompt);
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

    const currentChatId = context.chatId ? String(context.chatId) : 'default_chat';
    const targetScope = settings.defaultScope || 'chat';

    for (const item of extractedList) {
        if (!item.name || typeof item.name !== 'string' || !item.name.trim()) continue;

        const cleanName = item.name.trim();
        const existing = findExistingNpc(cleanName, item.aliases);

        const blocks = [
            { id: 'appearance', label: 'Appearance', type: 'text', value: item.appearance || '' },
            { id: 'personality', label: 'Personality', type: 'text', value: item.personality || '' },
            { id: 'relationship', label: 'Relationship', type: 'text', value: item.relationship || '' },
        ];

        if (existing) {
            if (updateMode === 'create_new_only') {
                continue;
            }

            // Merge details: retain existing non-empty values if extraction is sparse
            const mergedBlocks = Array.isArray(existing.blocks) ? [...existing.blocks] : [];
            for (const b of blocks) {
                const targetIdx = mergedBlocks.findIndex((mb) => mb.id === b.id);
                if (targetIdx !== -1) {
                    if (b.value && (!mergedBlocks[targetIdx].value || b.value.length > mergedBlocks[targetIdx].value.length)) {
                        mergedBlocks[targetIdx].value = b.value;
                    }
                } else if (b.value) {
                    mergedBlocks.push(b);
                }
            }

            updateNpc(existing.id, {
                aliases: item.aliases || existing.aliases,
                group_name: item.group_name || existing.group_name,
                location_keywords: item.location_keywords || existing.location_keywords,
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
                        target_id: currentChatId,
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
}

/**
 * Requests completion via the active SillyTavern API.
 * @param {string} prompt
 * @returns {Promise<string>}
 */
async function requestViaActiveApi(prompt) {
    const context = SillyTavern.getContext();

    if (typeof context.generateQuietPrompt === 'function') {
        return context.generateQuietPrompt({
            quietPrompt: prompt,
            skipWIAN: true,
            responseLength: 700,
            removeReasoning: true,
        });
    }

    if (typeof context.generateRaw === 'function') {
        return context.generateRaw({
            prompt,
            systemPrompt: 'You are an accurate structured data extraction assistant. Return ONLY valid JSON.',
            max_tokens: 700,
        });
    }

    throw new Error('Neither generateQuietPrompt nor generateRaw is available in this SillyTavern context.');
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
    const allNpcs = queryAll('SELECT * FROM npcs');
    const cleanTargetName = name.toLowerCase().trim();

    for (const npc of allNpcs) {
        if (npc.name && npc.name.toLowerCase().trim() === cleanTargetName) {
            return {
                ...npc,
                blocks: JSON.parse(npc.blocks_json || '[]'),
            };
        }

        // Check aliases
        if (npc.aliases) {
            const splitAliases = npc.aliases.toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
            if (splitAliases.includes(cleanTargetName)) {
                return {
                    ...npc,
                    blocks: JSON.parse(npc.blocks_json || '[]'),
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
