/**
 * @file index.js
 * @description Entry point for SillyTavern-NPC-tracker (Milestone 4: LLM Chat Scanner & Setting-Aware Engine)
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
    getNpcGroups,
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

import {
    initEditorModal,
    openNpcEditorModal,
    closeNpcEditorModal,
} from './src/ui/editor.js';

import {
    scanRecentChat,
    getConnectionProfiles,
    evaluateSettingAwareTriggers,
} from './src/scanner/chat-scanner.js';

export const MODULE_NAME = 'npc_tracker';

let messageCounterSinceLastScan = 0;

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
        updateMode: 'merge_existing', // 'create_new_only' | 'merge_existing'
        settingAwareFilter: false,
        customPrompt: '',
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
                quickListContainer.html('<div class="st-npc-empty-notice">No NPCs linked to active context. Click "+ New NPC" to create one.</div>');
            } else {
                const itemsHtml = activeNpcs.slice(0, 10).map((npc) => {
                    const safeName = DOMPurify.sanitize(npc.name || 'Unnamed NPC');
                    const safeScope = DOMPurify.sanitize(npc.scope_type || 'scope');
                    const safeGroup = npc.group_name ? DOMPurify.sanitize(npc.group_name) : '';
                    return `
                        <div class="st-npc-mini-card" data-npc-id="${npc.id}" title="Click to edit NPC sheet">
                            <span class="st-npc-mini-name">
                                <i class="fa-solid fa-user"></i> ${safeName}
                            </span>
                            <div class="st-npc-mini-meta">
                                ${safeGroup ? `<span class="st-npc-badge group"><i class="fa-solid fa-users"></i> ${safeGroup}</span>` : ''}
                                <span class="st-npc-mini-scope">${safeScope}</span>
                            </div>
                        </div>
                    `;
                }).join('');
                quickListContainer.html(itemsHtml);

                // Bind click on card to open Editor modal
                quickListContainer.find('.st-npc-mini-card').on('click', function () {
                    const npcId = $(this).data('npc-id');
                    if (npcId) {
                        openNpcEditorModal(npcId);
                    }
                });
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
        messageCounterSinceLastScan = 0;
        const activeNpcs = getActiveContextNpcs();
        console.debug(`[NPC Tracker] Context changed. ${activeNpcs.length} linked NPC(s) in active scope.`);
        syncPromptInjection();
        updateDrawerStats();
    } catch (err) {
        console.error('[NPC Tracker] Error updating prompt on context change:', err);
    }
}

/**
 * Event handler for automated scan triggers on new messages.
 */
async function onMessageReceived() {
    const context = SillyTavern.getContext();
    const settings = context.extensionSettings?.[MODULE_NAME];
    if (!settings || !settings.enabled || !settings.scanner || !settings.scanner.enabled) {
        return;
    }

    const { triggerMode, everyNMessages } = settings.scanner;

    if (triggerMode === 'every_n_messages') {
        messageCounterSinceLastScan++;
        if (messageCounterSinceLastScan >= (everyNMessages || 5)) {
            messageCounterSinceLastScan = 0;
            console.log(`[NPC Tracker] Automated scan triggered (every ${everyNMessages || 5} messages).`);
            try {
                const result = await scanRecentChat();
                if (result.created > 0 || result.updated > 0) {
                    updateDrawerStats();
                    if (window.toastr) {
                        window.toastr.info(`NPC Scanner: Found ${result.created} new, updated ${result.updated} NPC(s).`);
                    }
                }
            } catch (err) {
                console.error('[NPC Tracker] Automated message scan failed:', err);
            }
        }
    } else if (triggerMode === 'on_keyword') {
        // Quick keyword check on the last message
        const chat = context.chat || [];
        const lastMsg = chat[chat.length - 1]?.mes || '';
        if (lastMsg) {
            const activeNpcs = getActiveContextNpcs();
            const filtered = evaluateSettingAwareTriggers(activeNpcs, 1);
            if (filtered.length !== activeNpcs.length) {
                syncPromptInjection(settings);
                updateDrawerStats();
            }
        }
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

        // ==========================================
        // Bind Scanner Settings & Controls
        // ==========================================
        const scannerSettings = settings.scanner || {};

        // Scanner Profile Dropdown
        const profileSelect = $('#st_npc_scanner_profile');
        const profiles = getConnectionProfiles();
        profileSelect.empty();
        profileSelect.append('<option value="">Active SillyTavern API</option>');
        for (const p of profiles) {
            profileSelect.append(`<option value="${p.id}">${p.name} (${p.id})</option>`);
        }
        profileSelect.val(scannerSettings.connectionProfileId || '');
        profileSelect.off('change').on('change', () => {
            scannerSettings.connectionProfileId = String(profileSelect.val());
            context.saveSettingsDebounced();
        });

        // Scanner Enable Checkbox
        const scannerEnabledCheckbox = $('#st_npc_scanner_enabled');
        scannerEnabledCheckbox.prop('checked', Boolean(scannerSettings.enabled));
        if (scannerSettings.enabled) {
            $('#st_npc_scanner_controls').show();
        }
        scannerEnabledCheckbox.off('change').on('change', () => {
            scannerSettings.enabled = scannerEnabledCheckbox.prop('checked');
            if (scannerSettings.enabled) {
                $('#st_npc_scanner_controls').slideDown(150);
            } else {
                $('#st_npc_scanner_controls').slideUp(150);
            }
            context.saveSettingsDebounced();
        });

        // Scanner Trigger Mode
        const triggerSelect = $('#st_npc_scanner_trigger');
        triggerSelect.val(scannerSettings.triggerMode || 'manual');
        if (scannerSettings.triggerMode === 'every_n_messages') {
            $('#st_npc_scanner_every_n_row').show();
        }
        triggerSelect.off('change').on('change', () => {
            scannerSettings.triggerMode = String(triggerSelect.val());
            if (scannerSettings.triggerMode === 'every_n_messages') {
                $('#st_npc_scanner_every_n_row').slideDown(150);
            } else {
                $('#st_npc_scanner_every_n_row').slideUp(150);
            }
            context.saveSettingsDebounced();
        });

        // Scanner Scan Depth
        const scannerDepthInput = $('#st_npc_scanner_depth');
        scannerDepthInput.val(scannerSettings.scanDepth ?? 10);
        scannerDepthInput.off('change').on('change', () => {
            scannerSettings.scanDepth = parseInt(String(scannerDepthInput.val()), 10) || 10;
            context.saveSettingsDebounced();
        });

        // Scanner Every N Messages
        const scannerEveryNInput = $('#st_npc_scanner_every_n');
        scannerEveryNInput.val(scannerSettings.everyNMessages ?? 5);
        scannerEveryNInput.off('change').on('change', () => {
            scannerSettings.everyNMessages = parseInt(String(scannerEveryNInput.val()), 10) || 5;
            context.saveSettingsDebounced();
        });

        // Scanner Update Mode
        const updateModeSelect = $('#st_npc_scanner_update_mode');
        updateModeSelect.val(scannerSettings.updateMode || 'merge_existing');
        updateModeSelect.off('change').on('change', () => {
            scannerSettings.updateMode = String(updateModeSelect.val());
            context.saveSettingsDebounced();
        });

        // Setting-Aware Selective Injection Checkbox
        const settingAwareCheckbox = $('#st_npc_setting_aware_enabled');
        settingAwareCheckbox.prop('checked', Boolean(scannerSettings.settingAwareFilter));
        settingAwareCheckbox.off('change').on('change', () => {
            scannerSettings.settingAwareFilter = settingAwareCheckbox.prop('checked');
            context.saveSettingsDebounced();
            syncPromptInjection(settings);
            updateDrawerStats();
        });

        // Scan Recent Chat Now Button
        $('#st_npc_btn_scan_now').off('click').on('click', async () => {
            const btn = $('#st_npc_btn_scan_now');
            const btnText = $('#st_npc_scan_btn_text');
            const badge = $('#st_npc_scanner_status_badge');

            btn.prop('disabled', true);
            btnText.html('<i class="fa-solid fa-spinner fa-spin"></i> Scanning Chat...');
            badge.removeClass('info success warning').addClass('warning').textContent = 'Scanning...';

            try {
                const result = await scanRecentChat();
                badge.removeClass('warning').addClass('success').textContent = 'Completed';
                updateDrawerStats();

                if (window.toastr) {
                    window.toastr.success(`Scan Complete: ${result.created} created, ${result.updated} updated.`);
                }
            } catch (err) {
                console.error('[NPC Tracker] Scan error:', err);
                badge.removeClass('warning success').addClass('info').textContent = 'Error';
                if (window.toastr) {
                    window.toastr.error(`Scan failed: ${err.message}`);
                }
            } finally {
                btn.prop('disabled', false);
                btnText.html('<i class="fa-solid fa-radar"></i> Scan Recent Chat Now');
            }
        });

        // Bind + New NPC button to open Editor modal
        $('#st_npc_btn_open_editor').off('click').on('click', () => {
            openNpcEditorModal(null);
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
                        group_name: 'Wayfarers',
                        location_keywords: 'tavern, crossroads, highway',
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

        // Initialize NPC Sheet Editor modal
        await initEditorModal(updateDrawerStats);

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
            getNpcGroups,
            getActiveContextNpcs,
            queryAll,
            exportJson: exportDatabaseToJson,
            importJson: importDatabaseFromJson,
            syncPromptInjection: () => syncPromptInjection(settings),
            clearPromptInjection,
            getLastInjectedPrompt,
            renderNpcSheet,
            openNpcEditorModal,
            closeNpcEditorModal,
            scanRecentChat,
            getConnectionProfiles,
            evaluateSettingAwareTriggers,
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
            if (context.event_types?.CHARACTER_MESSAGE_RENDERED) {
                context.eventSource.on(context.event_types.CHARACTER_MESSAGE_RENDERED, onMessageReceived);
            }
            if (context.event_types?.MESSAGE_SENT) {
                context.eventSource.on(context.event_types.MESSAGE_SENT, onMessageReceived);
            }
        }

        console.log('[NPC Tracker] Milestone 4 (v4) initialized successfully.');
    } catch (err) {
        console.error('[NPC Tracker] Initialization failed:', err);
    }
});