/**
 * @file index.js
 * @description Entry point for SillyTavern-NPC-tracker (Milestone 2: Multi-Scope & Prompt Injection)
 */

import {
    initDatabase,
    createNpc,
    updateNpc,
    deleteNpc,
    getNpcById,
    linkNpcScope,
    unlinkNpcScope,
    getNpcScopes,
    setNpcScopeStatus,
    getActiveContextNpcs,
    queryAll,
    exportDatabaseToJson,
    importDatabaseFromJson,
} from './src/db/sqlite-store.js';

import {
    syncPromptInjection,
    clearPromptInjection,
    getLastInjectedPrompt,
    renderNpcSheet,
    INJECTION_KEY,
} from './src/injection.js';

export const MODULE_NAME = 'npc_tracker';

const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    defaultScope: 'chat', // 'chat' | 'character' | 'persona' | 'global'
    injectionPosition: 1, // 1 = in-chat, 0 = system prompt
    injectionDepth: 4,
    injectionRole: 0, // 0 = system, 1 = user, 2 = assistant
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

    if (!context.extensionSettings[MODULE_NAME]) {
        context.extensionSettings[MODULE_NAME] = {};
    }

    context.extensionSettings[MODULE_NAME] = lodash.merge(
        lodash.cloneDeep(DEFAULT_SETTINGS),
        context.extensionSettings[MODULE_NAME]
    );

    context.saveSettingsDebounced();
    return context.extensionSettings[MODULE_NAME];
}

/**
 * Updates dynamic statistics and quick list in the UI drawer.
 */
function updateDrawerStats() {
    try {
        const activeNpcs = getActiveContextNpcs();
        const countElement = document.getElementById('st_npc_active_count');
        if (countElement) {
            countElement.textContent = String(activeNpcs.length);
        }

        const badgeElement = document.getElementById('st_npc_injection_status_badge');
        if (badgeElement) {
            const context = SillyTavern.getContext();
            const settings = context.extensionSettings?.[MODULE_NAME] || {};
            if (!settings.enabled) {
                badgeElement.className = 'st-npc-badge warning';
                badgeElement.textContent = 'Disabled';
            } else if (activeNpcs.length === 0) {
                badgeElement.className = 'st-npc-badge info';
                badgeElement.textContent = 'Idle (0 in scope)';
            } else {
                badgeElement.className = 'st-npc-badge success';
                badgeElement.textContent = `Active (${activeNpcs.length})`;
            }
        }

        const quickListContainer = $('#st_npc_quick_list');
        if (quickListContainer.length) {
            const { DOMPurify } = SillyTavern.libs;
            if (activeNpcs.length === 0) {
                quickListContainer.html('<div class="st-npc-empty-notice">No NPCs linked to active context.</div>');
            } else {
                const itemsHtml = activeNpcs.slice(0, 5).map((npc) => {
                    const safeName = DOMPurify.sanitize(npc.name || 'Unnamed NPC');
                    const safeScope = DOMPurify.sanitize(npc.scope_type || 'scope');
                    return `
                        <div class="st-npc-mini-card" data-npc-id="${npc.id}">
                            <span class="st-npc-mini-name"><i class="fa-solid fa-user"></i> ${safeName}</span>
                            <span class="st-npc-mini-scope">${safeScope}</span>
                        </div>
                    `;
                }).join('');
                quickListContainer.html(itemsHtml);
            }
        }

        const previewText = document.getElementById('st_npc_preview_text');
        if (previewText) {
            const currentPrompt = getLastInjectedPrompt();
            previewText.textContent = currentPrompt || '(No prompt injected — 0 active NPCs in scope)';
        }
    } catch (err) {
        console.debug('[NPC Tracker] Could not update drawer stats:', err);
    }
}

/**
 * Event handler when active chat or character changes.
 */
function onContextChanged() {
    try {
        const activeNpcs = getActiveContextNpcs();
        console.debug(`[NPC Tracker] Context changed. ${activeNpcs.length} linked NPC(s) in active scope.`);
        syncPromptInjection();
        updateDrawerStats();
    } catch (err) {
        console.error('[NPC Tracker] Error updating prompt on context change:', err);
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

        // Inject into #extensions_settings2 as primary target, fallback to #extensions_settings
        let container = $('#extensions_settings2');
        if (!container.length) {
            container = $('#extensions_settings');
        }

        if (!container.length) {
            console.warn('[NPC Tracker] Neither #extensions_settings2 nor #extensions_settings found in DOM.');
            return;
        }

        // Remove existing drawer if re-rendering
        $('.st-npc-settings').remove();
        container.append(templateHtml);

        // Bind collapsible drawer toggle
        $('.st-npc-settings .inline-drawer-toggle').off('click').on('click', function () {
            const drawerContent = $(this).siblings('.inline-drawer-content');
            drawerContent.slideToggle(200);
            $(this).find('.inline-drawer-icon').toggleClass('down up');
        });

        // Bind Enable/Disable toggle
        const enabledCheckbox = $('#st_npc_enabled');
        enabledCheckbox.prop('checked', Boolean(settings.enabled));
        enabledCheckbox.off('change').on('change', () => {
            settings.enabled = enabledCheckbox.prop('checked');
            context.saveSettingsDebounced();
            if (settings.enabled) {
                syncPromptInjection(settings);
            } else {
                clearPromptInjection();
            }
            updateDrawerStats();
        });

        // Bind Default Scope dropdown
        const defaultScopeSelect = $('#st_npc_default_scope');
        defaultScopeSelect.val(settings.defaultScope || 'chat');
        defaultScopeSelect.off('change').on('change', () => {
            settings.defaultScope = String(defaultScopeSelect.val());
            context.saveSettingsDebounced();
        });

        // Bind Injection Depth input
        const depthInput = $('#st_npc_injection_depth');
        depthInput.val(settings.injectionDepth ?? 4);
        depthInput.off('change').on('change', () => {
            settings.injectionDepth = parseInt(String(depthInput.val()), 10) || 4;
            context.saveSettingsDebounced();
            syncPromptInjection(settings);
        });

        // Bind Injection Position select
        const positionSelect = $('#st_npc_injection_position');
        positionSelect.val(String(settings.injectionPosition ?? 1));
        positionSelect.off('change').on('change', () => {
            settings.injectionPosition = parseInt(String(positionSelect.val()), 10) || 1;
            context.saveSettingsDebounced();
            syncPromptInjection(settings);
        });

        // Bind Create Test NPC button
        $('#st_npc_btn_create_test').off('click').on('click', () => {
            try {
                const randomNum = Math.floor(Math.random() * 900 + 100);
                const scopeType = settings.defaultScope || 'chat';
                let targetId = 'global';

                if (scopeType === 'chat') {
                    targetId = context.chatId ? String(context.chatId) : 'default_chat';
                } else if (scopeType === 'character') {
                    targetId = context.characterId !== undefined && context.characters?.[context.characterId]
                        ? String(context.characters[context.characterId].avatar)
                        : 'default_character';
                } else if (scopeType === 'persona') {
                    targetId = context.powerUserSettings?.persona_selected || 'default_persona';
                }

                const testNpcId = createNpc(
                    {
                        name: `Test NPC #${randomNum}`,
                        aliases: `Traveler, Wanderer_${randomNum}`,
                        blocks: [
                            { id: 'appearance', label: 'Appearance', type: 'text', value: 'Dressed in travel-stained travelling cloaks.' },
                            { id: 'personality', label: 'Personality', type: 'text', value: 'Observant, cautious, speaks in soft whispers.' },
                            { id: 'relationship', label: 'Relationship', type: 'text', value: 'Recently met at the crossroads tavern.' },
                        ],
                    },
                    [{ scope_type: scopeType, target_id: targetId, relationship_summary: 'Met during testing' }]
                );

                syncPromptInjection(settings);
                updateDrawerStats();

                if (window.toastr) {
                    window.toastr.success(`Created Test NPC #${randomNum} & injected into prompt!`);
                }
                console.log(`[NPC Tracker] Created Test NPC ${testNpcId}`);
            } catch (err) {
                console.error('[NPC Tracker] Failed to create test NPC:', err);
                if (window.toastr) {
                    window.toastr.error('Failed to create test NPC');
                }
            }
        });

        // Bind Sync Prompt button
        $('#st_npc_btn_sync_prompt').off('click').on('click', () => {
            try {
                const promptText = syncPromptInjection(settings);
                updateDrawerStats();
                if (window.toastr) {
                    window.toastr.success(`Prompt synchronized (${promptText ? 'Injected' : 'Empty'}).`);
                }
            } catch (err) {
                console.error('[NPC Tracker] Manual sync failed:', err);
                if (window.toastr) {
                    window.toastr.error('Failed to sync prompt');
                }
            }
        });

        // Bind Preview Prompt toggle
        $('#st_npc_btn_preview_prompt').off('click').on('click', () => {
            const previewPanel = $('#st_npc_preview_panel');
            previewPanel.slideToggle(150, () => {
                updateDrawerStats();
            });
        });

        // Bind Export JSON button
        $('#st_npc_btn_export').off('click').on('click', () => {
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
        $('#st_npc_import_file').off('change').on('change', async (event) => {
            const input = event.target;
            const file = input.files?.[0];
            if (!file) return;

            try {
                const text = await file.text();
                const result = await importDatabaseFromJson(text);
                syncPromptInjection(settings);
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
        console.debug('[NPC Tracker] Settings drawer wired successfully into UI.');
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

        // Expose debug & console verification API
        window.ST_NPC_Tracker = {
            db,
            settings,
            createNpc,
            updateNpc,
            deleteNpc,
            getNpcById,
            linkNpcScope,
            unlinkNpcScope,
            getNpcScopes,
            setNpcScopeStatus,
            getActiveContextNpcs,
            queryAll,
            exportJson: exportDatabaseToJson,
            importJson: importDatabaseFromJson,
            syncPromptInjection: () => syncPromptInjection(settings),
            clearPromptInjection,
            getLastInjectedPrompt,
            renderNpcSheet,
            updateDrawerStats,
        };

        // Wire Extensions UI Drawer into SillyTavern
        await renderSettingsDrawer(settings);

        // Perform initial prompt synchronization
        syncPromptInjection(settings);

        // Wire SillyTavern lifecycle events
        if (context.eventSource) {
            if (context.event_types?.CHAT_CHANGED) {
                context.eventSource.on(context.event_types.CHAT_CHANGED, onContextChanged);
            }
            if (context.event_types?.CHARACTER_PAGE_LOADED) {
                context.eventSource.on(context.event_types.CHARACTER_PAGE_LOADED, onContextChanged);
            }
        }

        console.log('[NPC Tracker] Milestone 2 (v2) initialized successfully.');
    } catch (err) {
        console.error('[NPC Tracker] Initialization failed:', err);
    }
});