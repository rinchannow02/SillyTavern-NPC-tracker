/**
 * @file index.js
 * @description Entry point for SillyTavern-NPC-tracker (Milestone 1: Skeleton & SQLite Store)
 */

import {
    initDatabase,
    createNpc,
    getActiveContextNpcs,
    queryAll,
    exportDatabaseToJson,
    importDatabaseFromJson,
} from './src/db/sqlite-store.js';

export const MODULE_NAME = 'npc_tracker';

const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    defaultScope: 'chat', // 'chat' | 'character' | 'persona'
    scanner: {
        enabled: false,
        connectionProfileId: '', // Empty = use active ST API
        scanDepth: 10,
        triggerMode: 'manual', // 'manual' | 'every_n_messages' | 'on_keyword'
        everyNMessages: 5,
        updateMode: 'merge_existing', // 'create_new_only' | 'merge_existing' | 'ask_before_apply'
        customPrompt:
            'Extract any newly introduced or updated NPCs from the recent roleplay messages. Return structured JSON with name, appearance, personality, and relationship to the main characters.',
    },
    defaultTemplate: `### NPC: {{name}}\n- **Appearance:** {{appearance}}\n- **Personality:** {{personality}}\n- **Relationship:** {{relationship}}`,
});

/**
 * Ensures extensionSettings['npc_tracker'] is initialized with defaults.
 * @returns {Object} The active settings object for npc_tracker.
 */
function initExtensionSettings() {
    const context = SillyTavern.getContext();
    const { lodash } = SillyTavern.libs;

    context.extensionSettings[MODULE_NAME] = lodash.merge(
        lodash.cloneDeep(DEFAULT_SETTINGS),
        context.extensionSettings[MODULE_NAME] || {}
    );

    context.saveSettingsDebounced();
    return context.extensionSettings[MODULE_NAME];
}

/**
 * Updates dynamic statistics in the UI drawer.
 */
function updateDrawerStats() {
    try {
        const activeNpcs = getActiveContextNpcs();
        const countElement = document.getElementById('st_npc_active_count');
        if (countElement) {
            countElement.textContent = String(activeNpcs.length);
        }
    } catch (err) {
        console.debug('[NPC Tracker] Could not update drawer stats:', err);
    }
}

/**
 * Event handler when active chat changes.
 */
function onChatChanged() {
    try {
        const activeNpcs = getActiveContextNpcs();
        console.debug(`[NPC Tracker] Chat changed. Loaded ${activeNpcs.length} linked NPC(s) for active context.`);
        updateDrawerStats();
    } catch (err) {
        console.error('[NPC Tracker] Error querying NPCs on chat change:', err);
    }
}

/**
 * Renders the Extensions settings drawer for NPC Tracker and binds UI controls.
 * @param {Object} settings Active extension settings object.
 */
async function renderSettingsDrawer(settings) {
    const context = SillyTavern.getContext();
    const settingsUrl = new URL('./src/ui/settings.html', import.meta.url).href;

    try {
        const response = await fetch(settingsUrl);
        if (!response.ok) {
            throw new Error(`Failed to load settings template: HTTP ${response.status}`);
        }
        const templateHtml = await response.text();

        // Target the SillyTavern Extensions panel
        const container = $('#extensions_settings');
        if (!container.length) {
            console.warn('[NPC Tracker] #extensions_settings container not found in DOM.');
            return;
        }

        // Remove existing drawer if re-rendering
        $('.st-npc-settings').remove();
        container.append(templateHtml);

        // Bind Enable/Disable toggle
        const enabledCheckbox = $('#st_npc_enabled');
        enabledCheckbox.prop('checked', Boolean(settings.enabled));
        enabledCheckbox.on('change', () => {
            settings.enabled = enabledCheckbox.prop('checked');
            context.saveSettingsDebounced();
        });

        // Bind Default Scope dropdown
        const defaultScopeSelect = $('#st_npc_default_scope');
        defaultScopeSelect.val(settings.defaultScope || 'chat');
        defaultScopeSelect.on('change', () => {
            settings.defaultScope = String(defaultScopeSelect.val());
            context.saveSettingsDebounced();
        });

        // Bind Export JSON button
        $('#st_npc_btn_export').on('click', () => {
            try {
                const jsonStr = exportDatabaseToJson();
                const blob = new Blob([jsonStr], { type: 'application/json' });
                const downloadUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = `npc_tracker_backup_${new Date().toISOString().slice(0, 10)}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(downloadUrl);
                if (window.toastr) {
                    window.toastr.success('NPC Tracker database exported successfully.');
                }
            } catch (err) {
                console.error('[NPC Tracker] Export failed:', err);
                if (window.toastr) {
                    window.toastr.error('Failed to export NPC Tracker database.');
                }
            }
        });

        // Bind Import JSON button
        $('#st_npc_import_file').on('change', async (event) => {
            const input = event.target;
            const file = input.files?.[0];
            if (!file) return;

            try {
                const text = await file.text();
                const result = await importDatabaseFromJson(text);
                updateDrawerStats();
                if (window.toastr) {
                    window.toastr.success(`Imported ${result.npcsImported} NPCs and ${result.linksImported} links.`);
                }
            } catch (err) {
                console.error('[NPC Tracker] Import failed:', err);
                if (window.toastr) {
                    window.toastr.error(`Import failed: ${err.message}`);
                }
            } finally {
                input.value = '';
            }
        });

        updateDrawerStats();
        console.debug('[NPC Tracker] Settings drawer wired successfully.');
    } catch (err) {
        console.error('[NPC Tracker] Failed to render settings drawer:', err);
    }
}

/**
 * Bootstraps the NPC Tracker extension once SillyTavern is ready.
 */
jQuery(async () => {
    try {
        const context = SillyTavern.getContext();
        const settings = initExtensionSettings();

        const extensionBaseUrl = new URL('.', import.meta.url).href;
        const db = await initDatabase(extensionBaseUrl);

        // Expose debug & console verification API for Milestone 1
        window.ST_NPC_Tracker = {
            db,
            settings,
            createNpc,
            getActiveContextNpcs,
            queryAll,
            exportJson: exportDatabaseToJson,
            importJson: importDatabaseFromJson,
            updateDrawerStats,
        };

        // Wire Extensions UI Drawer into SillyTavern
        await renderSettingsDrawer(settings);

        // Wire SillyTavern lifecycle events
        context.eventSource.on(context.event_types.CHAT_CHANGED, onChatChanged);

        console.log('[NPC Tracker] Milestone 1 (v1) initialized successfully.');
    } catch (err) {
        console.error('[NPC Tracker] Initialization failed:', err);
    }
});