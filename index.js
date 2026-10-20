/**
 * @file index.js
 * @description Entry point for SillyTavern-NPC-tracker (v1.1.0: Customizable Templates, LLM Chat Scanner, Presets & Setting-Aware Engine)
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
    resolveScopeTarget,
    exportDatabaseToJson,
    importDatabaseFromJson,
} from './src/db/sqlite-store.js';

import {
    syncPromptInjection,
    clearPromptInjection,
    getLastInjectedPrompt,
    renderNpcSheet,
    INJECTION_KEY,
    IGNORE_CHAT_KEY,
    isChatIgnored,
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
    DEFAULT_EXTRACTION_PROMPT,
} from './src/scanner/chat-scanner.js';

import {
    BUILTIN_PRESETS,
    getAllPresets,
    getPresetById,
    exportPresetJson,
    importPresetFromJson,
} from './src/templates/preset-manager.js';

export const MODULE_NAME = 'npc_tracker';

let messageCounterSinceLastScan = 0;

const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    defaultScope: 'chat', // 'chat' | 'character' | 'persona' | 'global'
    injectionPosition: 1, // 1 = in-chat, 0 = system prompt
    injectionDepth: 4,
    injectionRole: 0, // 0 = system, 1 = user, 2 = assistant
    activeTemplateId: 'classic',
    customTemplates: [],
    scanner: {
        enabled: false,
        connectionProfileId: '', // Empty = use active ST API
        scanDepth: 10,
        maxTokens: 800,
        temperature: 0.2,
        triggerMode: 'manual', // 'manual' | 'every_n_messages' | 'on_keyword'
        everyNMessages: 5,
        updateMode: 'merge_existing', // 'create_new_only' | 'merge_existing'
        settingAwareFilter: false,
        customPrompt: '',
    },
    injectionTemplate: '[Active NPCs in Context:\n{{npcs}}\n]',
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
 * Triggers a client-side JSON file download in the browser.
 * @param {string} filename
 * @param {string} jsonStr
 */
function downloadJsonFile(filename, jsonStr) {
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
}

/**
 * Updates dynamic statistics and quick list in the UI drawer.
 * @param {Array<Object>|null} [cachedActiveNpcs] Optional pre-queried active context NPCs.
 */
function updateDrawerStats(cachedActiveNpcs = null) {
    try {
        const activeNpcs = cachedActiveNpcs || getActiveContextNpcs();
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
            } else if (isChatIgnored()) {
                badgeElement.className = 'st-npc-badge warning';
                badgeElement.textContent = 'Ignored (this chat)';
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
            quickListContainer.empty();
            if (activeNpcs.length === 0) {
                quickListContainer.html('<div class="st-npc-empty-notice">No NPCs linked to active context. Click "+ New NPC" to create one.</div>');
            } else {
                activeNpcs.slice(0, 10).forEach((npc) => {
                    const card = $('<div>')
                        .addClass('st-npc-mini-card')
                        .attr('data-npc-id', npc.id)
                        .attr('title', 'Click to edit NPC sheet');

                    const nameSpan = $('<span>')
                        .addClass('st-npc-mini-name')
                        .append($('<i>').addClass('fa-solid fa-user'))
                        .append(document.createTextNode(' ' + (npc.name || 'Unnamed NPC')));
                    card.append(nameSpan);

                    const metaDiv = $('<div>').addClass('st-npc-mini-meta');
                    if (npc.group_name) {
                        const groupSpan = $('<span>')
                            .addClass('st-npc-badge group')
                            .append($('<i>').addClass('fa-solid fa-users'))
                            .append(document.createTextNode(' ' + npc.group_name));
                        metaDiv.append(groupSpan);
                    }
                    const scopeSpan = $('<span>')
                        .addClass('st-npc-mini-scope')
                        .text(npc.scope_type || 'scope');
                    metaDiv.append(scopeSpan);

                    card.append(metaDiv);
                    quickListContainer.append(card);
                });

                // Bind click on card to open Editor modal
                quickListContainer.find('.st-npc-mini-card').on('click', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
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
        refreshIgnoreChatCheckbox();
        syncPromptInjection(undefined, activeNpcs);
        updateDrawerStats(activeNpcs);
    } catch (err) {
        console.error('[NPC Tracker] Error updating prompt on context change:', err);
    }
}

/**
 * Reflects the current chat's ignore flag in the drawer checkbox (disabled when no chat is open).
 */
function refreshIgnoreChatCheckbox() {
    const hasChat = Boolean(SillyTavern.getContext().chatId);
    $('#st_npc_ignore_chat').prop('checked', hasChat && isChatIgnored()).prop('disabled', !hasChat);
}

/**
 * Runs an automated scan with visible start/finish/error toasts.
 * @param {number} n Configured message interval (for the banner text).
 */
async function runAutoScan(n) {
    console.log(`[NPC Tracker] Automated scan triggered (every ${n} messages).`);
    window.toastr?.info(`NPC Scanner: auto-scanning recent chat (every ${n} messages)...`);
    try {
        const result = await scanRecentChat();
        if (result.skipped) return;
        updateDrawerStats();
        window.toastr?.success(`NPC Scanner: ${result.created} new, ${result.updated} updated NPC(s).`);
    } catch (err) {
        console.error('[NPC Tracker] Automated message scan failed:', err);
        window.toastr?.error(`NPC auto-scan failed: ${err.message}`);
    }
}

/**
 * Event handler for automated scan triggers on new messages.
 * @param {boolean} canScan False for user sends: count them, but wait for the character reply before scanning.
 */
async function onMessageReceived(canScan) {
    const context = SillyTavern.getContext();
    const settings = context.extensionSettings?.[MODULE_NAME];
    if (!settings || !settings.enabled || isChatIgnored()) {
        return;
    }

    if (!settings.scanner || !settings.scanner.enabled) {
        return;
    }

    const { triggerMode, everyNMessages } = settings.scanner;

    if (triggerMode !== 'every_n_messages') {
        return;
    }

    const n = everyNMessages || 5;
    messageCounterSinceLastScan++;
    if (!canScan || messageCounterSinceLastScan < n) {
        return;
    }
    messageCounterSinceLastScan = 0;
    // Not awaited: ST awaits event listeners, so awaiting would stall the chat until the scan finishes.
    runAutoScan(n);
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

        // Bind per-chat Ignore toggle (always reads the live chat, since chatMetadata is replaced on chat switch)
        refreshIgnoreChatCheckbox();
        $('#st_npc_ignore_chat').off('change').on('change', function () {
            const ctx = SillyTavern.getContext();
            if (!ctx.chatId) return;
            if ($(this).prop('checked')) {
                ctx.chatMetadata[IGNORE_CHAT_KEY] = true;
            } else {
                delete ctx.chatMetadata[IGNORE_CHAT_KEY];
            }
            ctx.saveMetadataDebounced();
            syncPromptInjection(settings);
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
            const n = parseInt(String(depthInput.val()), 10);
            settings.injectionDepth = Number.isFinite(n) ? n : 4;
            context.saveSettingsDebounced();
            syncPromptInjection(settings);
        });

        // Bind Injection Position select
        const positionSelect = $('#st_npc_injection_position');
        positionSelect.val(String(settings.injectionPosition ?? 1));
        positionSelect.off('change').on('change', () => {
            const n = parseInt(String(positionSelect.val()), 10);
            settings.injectionPosition = Number.isFinite(n) ? n : 1;
            context.saveSettingsDebounced();
            syncPromptInjection(settings);
        });

        // Bind Custom Injection Prompt Format
        const defaultInjectionTemplate = '[Active NPCs in Context:\n{{npcs}}\n]';
        const injectionTemplateInput = $('#st_npc_injection_template');
        injectionTemplateInput.val(settings.injectionTemplate ?? defaultInjectionTemplate);

        let injectionTemplateTimer = null;
        injectionTemplateInput.off('input change').on('input change', () => {
            if (injectionTemplateTimer) clearTimeout(injectionTemplateTimer);
            injectionTemplateTimer = setTimeout(() => {
                settings.injectionTemplate = String(injectionTemplateInput.val() || '');
                context.saveSettingsDebounced();
                syncPromptInjection(settings);
            }, 300);
        });

        $(document).off('click', '#st_npc_injection_template_toggle').on('click', '#st_npc_injection_template_toggle', () => {
            const body = $('#st_npc_injection_template_body');
            const chevron = $('#st_npc_injection_chevron');
            body.slideToggle(150);
            const isOpen = body.is(':visible');
            chevron.css('transform', isOpen ? 'rotate(90deg)' : 'rotate(0deg)');
        });

        $(document).off('click', '#st_npc_btn_reset_injection_template').on('click', '#st_npc_btn_reset_injection_template', () => {
            injectionTemplateInput.val(defaultInjectionTemplate);
            settings.injectionTemplate = defaultInjectionTemplate;
            context.saveSettingsDebounced();
            syncPromptInjection(settings);
            if (window.toastr) window.toastr.info('Reset injection prompt format to default.');
        });

        // ==========================================
        // Bind Database Template & Presets Controls
        // ==========================================
        const presetToggle = $('#st_npc_preset_toggle');
        const presetBody = $('#st_npc_preset_body');
        const presetChevron = $('#st_npc_preset_chevron');
        const presetSelect = $('#st_npc_preset_select');
        const activePresetBadge = $('#st_npc_active_preset_badge');
        const presetDesc = $('#st_npc_preset_desc');
        const blocksSummary = $('#st_npc_preset_blocks_summary');
        const promptPreview = $('#st_npc_preset_prompt_preview');
        const deletePresetBtn = $('#st_npc_btn_delete_preset');

        presetToggle.off('click').on('click', () => {
            presetBody.slideToggle(150);
            const isOpen = presetBody.is(':visible');
            presetChevron.css('transform', isOpen ? 'rotate(90deg)' : 'rotate(0deg)');
        });

        function refreshPresetsUI() {
            if (!Array.isArray(settings.customTemplates)) {
                settings.customTemplates = [];
            }
            const allPresets = getAllPresets(settings.customTemplates);
            presetSelect.empty();

            for (const preset of allPresets) {
                const opt = $('<option></option>')
                    .val(preset.id)
                    .text(`${preset.name}${preset.isBuiltin ? '' : ' [Custom]'}`);
                presetSelect.append(opt);
            }

            const currentId = settings.activeTemplateId || 'classic';
            presetSelect.val(currentId);

            const activePreset = getPresetById(currentId, settings.customTemplates);
            activePresetBadge.text(activePreset.name);
            presetDesc.text(activePreset.description || '');

            const blockNames = (activePreset.blocks || []).map((b) => b.label || b.id).join(', ');
            blocksSummary.text(blockNames || '(No blocks defined)');
            promptPreview.text(activePreset.extractionPrompt || '(No extraction prompt defined)');

            if (activePreset.isBuiltin) {
                deletePresetBtn.hide();
            } else {
                deletePresetBtn.show();
            }

            if (!scannerSettings.customPrompt) {
                $('#st_npc_scanner_prompt').val(activePreset.extractionPrompt || DEFAULT_EXTRACTION_PROMPT);
            }
        }

        refreshPresetsUI();

        presetSelect.off('change').on('change', function () {
            settings.activeTemplateId = $(this).val();
            context.saveSettingsDebounced();
            refreshPresetsUI();
            if (window.toastr) {
                window.toastr.info(`Default template changed to: ${activePresetBadge.text()}`);
            }
        });

        // Export Preset JSON
        $(document).off('click', '#st_npc_btn_export_preset').on('click', '#st_npc_btn_export_preset', () => {
            try {
                const activePreset = getPresetById(settings.activeTemplateId || 'classic', settings.customTemplates);
                const jsonStr = exportPresetJson(activePreset);
                downloadJsonFile(`npc_preset_${activePreset.id}.json`, jsonStr);
                if (window.toastr) {
                    window.toastr.success(`Preset "${activePreset.name}" exported successfully.`);
                }
            } catch (err) {
                console.error('[NPC Tracker] Failed to export preset:', err);
                if (window.toastr) {
                    window.toastr.error(`Export preset failed: ${err.message}`);
                }
            }
        });

        // Import Preset JSON
        $('#st_npc_file_import_preset').off('change').on('change', async (event) => {
            const input = event.target;
            const file = input.files?.[0];
            if (!file) return;

            try {
                const text = await file.text();
                const imported = importPresetFromJson(text);

                if (BUILTIN_PRESETS.some((p) => p.id === imported.id)) {
                    imported.id = `custom_${Date.now()}`;
                    imported.name = `${imported.name} (Custom)`;
                }

                if (!Array.isArray(settings.customTemplates)) {
                    settings.customTemplates = [];
                }

                const existingIdx = settings.customTemplates.findIndex((p) => p.id === imported.id);
                if (existingIdx >= 0) {
                    settings.customTemplates[existingIdx] = imported;
                } else {
                    settings.customTemplates.push(imported);
                }

                settings.activeTemplateId = imported.id;
                context.saveSettingsDebounced();
                refreshPresetsUI();
                if (window.toastr) {
                    window.toastr.success(`Preset "${imported.name}" imported and activated.`);
                }
            } catch (err) {
                console.error('[NPC Tracker] Failed to import preset:', err);
                if (window.toastr) {
                    window.toastr.error(`Import preset failed: ${err.message}`);
                }
            } finally {
                input.value = '';
            }
        });

        // Duplicate Preset
        $(document).off('click', '#st_npc_btn_duplicate_preset').on('click', '#st_npc_btn_duplicate_preset', () => {
            const activePreset = getPresetById(settings.activeTemplateId || 'classic', settings.customTemplates);
            const defaultNewName = `${activePreset.name} (Copy)`;
            const newName = window.prompt('Enter a name for the duplicated preset:', defaultNewName);
            if (!newName || !newName.trim()) return;

            const newId = `custom_${Date.now()}`;
            const clonedPreset = {
                id: newId,
                name: newName.trim(),
                description: activePreset.description || '',
                isBuiltin: false,
                blocks: JSON.parse(JSON.stringify(activePreset.blocks || [])),
                template: activePreset.template || '',
                extractionPrompt: activePreset.extractionPrompt || '',
            };

            if (!Array.isArray(settings.customTemplates)) {
                settings.customTemplates = [];
            }
            settings.customTemplates.push(clonedPreset);
            settings.activeTemplateId = newId;
            context.saveSettingsDebounced();
            refreshPresetsUI();

            if (window.toastr) {
                window.toastr.success(`Preset duplicated as "${clonedPreset.name}".`);
            }
        });

        // Delete Custom Preset
        $(document).off('click', '#st_npc_btn_delete_preset').on('click', '#st_npc_btn_delete_preset', () => {
            const activePreset = getPresetById(settings.activeTemplateId || 'classic', settings.customTemplates);
            if (activePreset.isBuiltin) {
                if (window.toastr) window.toastr.warning('Built-in presets cannot be deleted.');
                return;
            }

            const confirmDelete = window.confirm(`Are you sure you want to delete the custom preset "${activePreset.name}"?`);
            if (!confirmDelete) return;

            if (Array.isArray(settings.customTemplates)) {
                settings.customTemplates = settings.customTemplates.filter((p) => p.id !== activePreset.id);
            }
            settings.activeTemplateId = 'classic';
            context.saveSettingsDebounced();
            refreshPresetsUI();

            if (window.toastr) {
                window.toastr.info(`Preset "${activePreset.name}" deleted. Switched to Classic preset.`);
            }
        });

        // ==========================================
        // Bind Scanner Settings & Controls
        // ==========================================
        const scannerSettings = settings.scanner || {};

        // Scanner Profile Dropdown & Refresh
        const profileSelect = $('#st_npc_scanner_profile');
        function refreshProfilesDropdown() {
            const currentVal = scannerSettings.connectionProfileId || profileSelect.val() || '';
            const profiles = getConnectionProfiles();
            profileSelect.empty();
            profileSelect.append('<option value="">Active SillyTavern API</option>');
            for (const p of profiles) {
                profileSelect.append($('<option>').val(p.id).text(p.name));
            }
            if (currentVal) {
                profileSelect.val(currentVal);
            }
        }

        refreshProfilesDropdown();

        profileSelect.off('focus').on('focus', refreshProfilesDropdown);
        $(document).off('click', '#st_npc_scanner_refresh_profiles').on('click', '#st_npc_scanner_refresh_profiles', (e) => {
            e.preventDefault();
            refreshProfilesDropdown();
            if (window.toastr) {
                window.toastr.info('Connection profiles reloaded.');
            }
        });

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
                refreshProfilesDropdown();
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
            scannerSettings.scanDepth = Math.max(1, parseInt(String(scannerDepthInput.val()), 10) || 10);
            context.saveSettingsDebounced();
        });

        // Scanner Max Output Tokens
        const scannerMaxTokensInput = $('#st_npc_scanner_max_tokens');
        scannerMaxTokensInput.val(scannerSettings.maxTokens ?? 800);
        scannerMaxTokensInput.off('change').on('change', () => {
            scannerSettings.maxTokens = parseInt(String(scannerMaxTokensInput.val()), 10) || 800;
            context.saveSettingsDebounced();
        });

        // Scanner Temperature
        const scannerTempInput = $('#st_npc_scanner_temperature');
        scannerTempInput.val(scannerSettings.temperature ?? 0.2);
        scannerTempInput.off('change').on('change', () => {
            const n = parseFloat(String(scannerTempInput.val()));
            scannerSettings.temperature = Number.isFinite(n) ? n : 0.2;
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

        // Custom Scanner Prompt Textarea & Toggle
        const promptTextarea = $('#st_npc_scanner_prompt');
        const currentActivePreset = getPresetById(settings.activeTemplateId || 'classic', settings.customTemplates);
        promptTextarea.val(scannerSettings.customPrompt || currentActivePreset.extractionPrompt || DEFAULT_EXTRACTION_PROMPT);

        promptTextarea.off('input change').on('input change', () => {
            const active = getPresetById(settings.activeTemplateId || 'classic', settings.customTemplates);
            const val = String(promptTextarea.val() || '').trim();
            const activePrompt = String(active.extractionPrompt || DEFAULT_EXTRACTION_PROMPT).trim();

            if (!val || val === activePrompt) {
                scannerSettings.customPrompt = '';
            } else {
                scannerSettings.customPrompt = String(promptTextarea.val());
            }
            context.saveSettingsDebounced();
        });

        $(document).off('click', '#st_npc_scanner_prompt_toggle').on('click', '#st_npc_scanner_prompt_toggle', (e) => {
            e.preventDefault();
            const body = $('#st_npc_scanner_prompt_body');
            const chevron = $('#st_npc_prompt_chevron');
            if (body.is(':visible')) {
                body.slideUp(150);
                chevron.css('transform', 'rotate(0deg)');
            } else {
                body.slideDown(150);
                chevron.css('transform', 'rotate(90deg)');
            }
        });

        $(document).off('click', '#st_npc_btn_reset_prompt').on('click', '#st_npc_btn_reset_prompt', (e) => {
            e.preventDefault();
            const active = getPresetById(settings.activeTemplateId || 'classic', settings.customTemplates);
            const resetPrompt = active.extractionPrompt || DEFAULT_EXTRACTION_PROMPT;
            promptTextarea.val(resetPrompt);
            scannerSettings.customPrompt = '';
            context.saveSettingsDebounced();
            if (window.toastr) {
                window.toastr.success(`Extraction prompt reset to "${active.name}" preset default.`);
            }
        });

        // Scan Recent Chat Now Button
        $('#st_npc_btn_scan_now').off('click').on('click', async () => {
            const btn = $('#st_npc_btn_scan_now');
            const btnText = $('#st_npc_scan_btn_text');
            const badge = $('#st_npc_scanner_status_badge');

            btn.prop('disabled', true);
            btnText.html('<i class="fa-solid fa-spinner fa-spin"></i> Scanning Chat...');
            badge.removeClass('info success warning').addClass('warning').text('Scanning...');

            try {
                const result = await scanRecentChat();
                badge.removeClass('warning').addClass('success').text('Completed');
                updateDrawerStats();

                if (window.toastr) {
                    window.toastr.success(`Scan Complete: ${result.created} created, ${result.updated} updated.`);
                }
            } catch (err) {
                console.error('[NPC Tracker] Scan error:', err);
                badge.removeClass('warning success').addClass('info').text('Error');
                if (window.toastr) {
                    window.toastr.error(`Scan failed: ${err.message}`);
                }
            } finally {
                btn.prop('disabled', false);
                btnText.html('<i class="fa-solid fa-radar"></i> Scan Recent Chat Now');
            }
        });

        // Bind + New NPC button to open Editor modal
        $('#st_npc_btn_open_editor').off('click').on('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openNpcEditorModal(null);
        });

        // Bind Create Test NPC button
        $('#st_npc_btn_create_test').off('click').on('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
                const randomNum = Math.floor(Math.random() * 900 + 100);
                const scopeType = settings.defaultScope || 'chat';
                const targetId = resolveScopeTarget(scopeType, context) || `default_${scopeType}`;

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
        $('#st_npc_btn_sync_prompt').off('click').on('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
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
        $('#st_npc_btn_preview_prompt').off('click').on('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const previewPanel = $('#st_npc_preview_panel');
            previewPanel.slideToggle(150, () => {
                updateDrawerStats();
            });
        });

        // Bind Export JSON button
        $('#st_npc_btn_export').off('click').on('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
                const jsonStr = exportDatabaseToJson();
                downloadJsonFile(`npc_tracker_backup_${new Date().toISOString().slice(0, 10)}.json`, jsonStr);
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

        await initDatabase();

        // Initialize NPC Sheet Editor modal
        await initEditorModal(updateDrawerStats);

        // Expose debug & console verification API
        window.ST_NPC_Tracker = {
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
                context.eventSource.on(context.event_types.CHARACTER_MESSAGE_RENDERED, () => onMessageReceived(true));
            }
            if (context.event_types?.MESSAGE_SENT) {
                context.eventSource.on(context.event_types.MESSAGE_SENT, () => onMessageReceived(false));
            }
            if (context.event_types?.GENERATION_STARTED) {
                context.eventSource.on(context.event_types.GENERATION_STARTED, () => {
                    const currentSettings = SillyTavern.getContext().extensionSettings?.[MODULE_NAME];
                    if (currentSettings?.enabled && currentSettings?.scanner?.settingAwareFilter) {
                        const active = getActiveContextNpcs();
                        syncPromptInjection(currentSettings, active);
                        updateDrawerStats(active);
                    }
                });
            }
        }

        console.log('[NPC Tracker] Extension initialized successfully.');
    } catch (err) {
        console.error('[NPC Tracker] Initialization failed:', err);
    }
});