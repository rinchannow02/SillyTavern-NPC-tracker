/**
 * @file src/injection.js
 * @description Renders active NPC sheets and injects them into the SillyTavern prompt context.
 */

import { getActiveContextNpcs } from './db/sqlite-store.js';
import { evaluateSettingAwareTriggers } from './scanner/chat-scanner.js';

export const INJECTION_KEY = 'npc_tracker';
export const IGNORE_CHAT_KEY = 'npc_tracker_ignored';

/**
 * Whether the user has opted the currently open chat out of NPC injection and auto-scans.
 * Stored in chat metadata so the flag travels with the chat file.
 * @returns {boolean}
 */
export function isChatIgnored() {
    return Boolean(SillyTavern.getContext().chatMetadata?.[IGNORE_CHAT_KEY]);
}

let lastInjectedPrompt = '';

/**
 * Renders an individual NPC record into formatted markdown for LLM prompt context.
 * @param {Object} npc - The NPC record object.
 * @returns {string} Formatted markdown representation.
 */
export function renderNpcSheet(npc) {
    if (npc.template_mode === 'template' && npc.raw_content && npc.raw_content.trim()) {
        // Function replacers: a string replacement would expand $&, $' etc. inside NPC text.
        let content = npc.raw_content;
        content = content.replace(/\{\{name\}\}/gi, () => npc.name || '');
        content = content.replace(/\{\{aliases\}\}/gi, () => npc.aliases || '');
        content = content.replace(/\{\{(group|group_name)\}\}/gi, () => npc.group_name || '');
        content = content.replace(/\{\{(location|location_keywords)\}\}/gi, () => npc.location_keywords || '');

        const blocks = Array.isArray(npc.blocks) ? npc.blocks : [];
        const blockMap = new Map();
        for (const b of blocks) {
            if (b) {
                if (b.id) blockMap.set(String(b.id).toLowerCase(), b.value || '');
                if (b.label) blockMap.set(String(b.label).toLowerCase(), b.value || '');
            }
        }

        content = content.replace(/\{\{appearance\}\}/gi, () => blockMap.get('appearance') || '');
        content = content.replace(/\{\{personality\}\}/gi, () => blockMap.get('personality') || '');
        content = content.replace(/\{\{relationship\}\}/gi, () => blockMap.get('relationship') || npc.relationship_summary || '');
        content = content.replace(/\{\{([\w-]+)\}\}/g, (match, p1) => {
            const lower = p1.toLowerCase();
            if (['name', 'aliases', 'group', 'group_name', 'location', 'location_keywords', 'appearance', 'personality', 'relationship'].includes(lower)) {
                return match;
            }
            if (blockMap.has(lower)) {
                return blockMap.get(lower);
            }
            return match;
        });

        return content.trim();
    }

    const lines = [];
    let title = npc.aliases ? `### NPC: ${npc.name} (${npc.aliases})` : `### NPC: ${npc.name}`;
    if (npc.group_name) {
        title += ` [Group: ${npc.group_name}]`;
    }
    lines.push(title);

    if (npc.location_keywords && String(npc.location_keywords).trim()) {
        lines.push(`- **Location/Setting:** ${String(npc.location_keywords).trim()}`);
    }

    const blocks = Array.isArray(npc.blocks) ? npc.blocks : [];
    for (const block of blocks) {
        if (block && block.value && String(block.value).trim()) {
            const label = block.label || block.id || 'Detail';
            lines.push(`- **${label}:** ${String(block.value).trim()}`);
        }
    }

    if (npc.relationship_summary && String(npc.relationship_summary).trim()) {
        lines.push(`- **Context Affinity:** ${String(npc.relationship_summary).trim()}`);
    }

    return lines.join('\n');
}

export const DEFAULT_INJECTION_TEMPLATE = '[Active NPCs in Context:\n{{npcs}}\n]';

/**
 * Aggregates all active context NPCs into a consolidated prompt injection block.
 * @param {Array<Object>} npcs - List of active NPCs in current context.
 * @param {string} [customTemplate] - Optional custom injection wrapper template using {{npcs}}.
 * @returns {string}
 */
export function formatActiveNpcsPrompt(npcs, customTemplate) {
    if (!npcs || npcs.length === 0) return '';

    const renderedNpcs = npcs.map((npc) => renderNpcSheet(npc)).filter(Boolean);
    if (renderedNpcs.length === 0) return '';

    const template = (customTemplate && typeof customTemplate === 'string' && customTemplate.includes('{{npcs}}'))
        ? customTemplate
        : DEFAULT_INJECTION_TEMPLATE;

    return template.replace(/\{\{npcs\}\}/g, () => renderedNpcs.join('\n\n'));
}

/**
 * Synchronizes prompt injection by querying active context NPCs and invoking setExtensionPrompt.
 * @param {Object} [customSettings]
 * @param {Array<Object>} [activeNpcsList] Optional pre-queried active context NPCs to avoid redundant lookups.
 * @returns {string} The injected prompt string.
 */
export function syncPromptInjection(customSettings, activeNpcsList = null) {
    const context = SillyTavern.getContext();
    const settings = customSettings || context.extensionSettings?.['npc_tracker'] || {};

    if (settings.enabled === false || isChatIgnored()) {
        clearPromptInjection();
        return '';
    }

    const activeNpcs = Array.isArray(activeNpcsList) ? activeNpcsList : getActiveContextNpcs();
    if (!activeNpcs || activeNpcs.length === 0) {
        clearPromptInjection();
        lastInjectedPrompt = '';
        return '';
    }

    let targetNpcs = activeNpcs;
    if (settings.scanner?.settingAwareFilter) {
        targetNpcs = evaluateSettingAwareTriggers(activeNpcs, settings.scanner?.scanDepth || 4);
    }

    const promptText = formatActiveNpcsPrompt(targetNpcs, settings.injectionTemplate);
    const position = settings.injectionPosition ?? 1; // 1 = in-chat
    const depth = settings.injectionDepth ?? 4;
    const role = settings.injectionRole ?? 0; // 0 = system
    const scan = false;

    if (typeof context.setExtensionPrompt === 'function') {
        context.setExtensionPrompt(INJECTION_KEY, promptText, position, depth, scan, role);
        lastInjectedPrompt = promptText;
        console.debug(`[NPC Tracker] Injected ${activeNpcs.length} active NPC(s) into prompt (pos=${position}, depth=${depth}).`);
    } else {
        console.warn('[NPC Tracker] context.setExtensionPrompt is not available in this ST build.');
    }

    return promptText;
}

/**
 * Clears the active NPC Tracker extension prompt from SillyTavern context.
 */
export function clearPromptInjection() {
    const context = SillyTavern.getContext();
    if (typeof context.setExtensionPrompt === 'function') {
        context.setExtensionPrompt(INJECTION_KEY, '');
        lastInjectedPrompt = '';
        console.debug('[NPC Tracker] Cleared extension prompt injection.');
    }
}

/**
 * Retrieves the most recently injected prompt text.
 * @returns {string}
 */
export function getLastInjectedPrompt() {
    return lastInjectedPrompt;
}
