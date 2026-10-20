/**
 * @file src/ui/editor.js
 * @description Dynamic Block & Template NPC Sheet Editor Controller.
 */

import {
    getNpcById,
    createNpc,
    updateNpc,
    deleteNpc,
    saveDatabaseNow,
    linkNpcScope,
    unlinkNpcScope,
    getNpcScopes,
    setNpcScopeStatus,
    getNpcGroups,
    getNpcGroupHierarchy,
    resolveScopeTarget,
    DEFAULT_BLOCKS,
} from '../db/sqlite-store.js';

import { syncPromptInjection } from '../injection.js';
import { blocksToTemplate, templateToBlocks } from './template-converter.js';
import {
    getAllPresets,
    getPresetById,
    generateBlocksFromPreset,
} from '../templates/preset-manager.js';

let modalInitialized = false;
let currentNpcId = null;
let currentBlocks = [];
let currentLinks = [];
let currentMode = 'basic';
let onModalSavedCallback = null;
let sessionCustomGroups = [];
let currentPresetId = 'classic';

const STANDARD_BLOCK_IDS = new Set(['appearance', 'personality', 'relationship']);

/**
 * Ensures the editor modal template is fetched and attached to DOM.
 */
export async function initEditorModal(onSaved) {
    if (onSaved) onModalSavedCallback = onSaved;
    if (modalInitialized && document.getElementById('st_npc_modal_backdrop')) return;

    const modalUrl = new URL('./editor-modal.html', import.meta.url).href;
    const response = await fetch(modalUrl);
    if (!response.ok) {
        throw new Error(`Failed to load editor-modal.html: HTTP ${response.status}`);
    }
    const html = await response.text();
    $('#st_npc_modal_backdrop').remove();
    $('body').append(html);

    bindModalEvents();
    modalInitialized = true;
}

let wasExtensionsDrawerOpen = false;

/**
 * Binds robust delegated events for the modal dialog.
 */
function bindModalEvents() {
    // Prevent clicks/interactions inside modal dialog from closing SillyTavern drawers
    $(document).off('click mousedown pointerdown', '#st_npc_modal_backdrop .st-npc-modal-dialog')
        .on('click mousedown pointerdown', '#st_npc_modal_backdrop .st-npc-modal-dialog', (e) => {
            e.stopPropagation();
        });

    // Close / Cancel
    $(document).off('click', '#st_npc_modal_close_btn, #st_npc_modal_cancel_btn').on('click', '#st_npc_modal_close_btn, #st_npc_modal_cancel_btn', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeNpcEditorModal();
    });

    // Backdrop click
    $(document).off('click', '#st_npc_modal_backdrop').on('click', '#st_npc_modal_backdrop', (e) => {
        if ($(e.target).is('#st_npc_modal_backdrop')) {
            e.preventDefault();
            e.stopPropagation();
            closeNpcEditorModal();
        }
    });

    // Tab Bar Switching with two-way conversion prompt
    $(document).off('click', '.st-npc-tab-btn').on('click', '.st-npc-tab-btn', async function (e) {
        e.preventDefault();
        const tab = $(this).data('tab');
        await handleTabSwitch(tab);
    });

    // Populate from Blocks button in Template tab
    $(document).off('click', '#st_npc_btn_sync_from_blocks').on('click', '#st_npc_btn_sync_from_blocks', async (e) => {
        e.preventDefault();
        syncBlocksFromDom();
        const currentTemplate = ($('#st_npc_edit_template_content').val() || '').trim();
        if (currentTemplate) {
            const overwrite = await askUserConfirm(
                'Populate from Blocks',
                'Overwrite the freeform template with content generated from current blocks?'
            );
            if (!overwrite) return;
        }
        const formData = getModalFormData();
        const generated = blocksToTemplate(formData, { useTokens: true });
        $('#st_npc_edit_template_content').val(generated);
        if (window.toastr) window.toastr.success('Populated template from current blocks.');
    });

    // Parse from Template button in Basic tab
    $(document).off('click', '#st_npc_btn_sync_from_template').on('click', '#st_npc_btn_sync_from_template', async (e) => {
        e.preventDefault();
        const currentTemplate = ($('#st_npc_edit_template_content').val() || '').trim();
        if (!currentTemplate) {
            if (window.toastr) window.toastr.warning('Freeform template is empty.');
            return;
        }
        const parseNow = await askUserConfirm(
            'Parse Template to Blocks',
            'Parse freeform template into blocks? This will update the block fields.'
        );
        if (!parseNow) return;

        const parsed = templateToBlocks(currentTemplate, { blocks: currentBlocks });
        applyParsedDataToModal(parsed);
        if (window.toastr) window.toastr.success('Parsed template into blocks.');
    });

    // Toggle Group Tree
    $(document).off('click', '#st_npc_btn_toggle_group_tree').on('click', '#st_npc_btn_toggle_group_tree', (e) => {
        e.preventDefault();
        renderGroupTree();
        $('#st_npc_group_tree_panel').slideToggle(120);
    });

    // Close Group Tree
    $(document).off('click', '#st_npc_btn_close_group_tree').on('click', '#st_npc_btn_close_group_tree', (e) => {
        e.preventDefault();
        $('#st_npc_group_tree_panel').slideUp(100);
    });

    // Clear Group Button
    $(document).off('click', '#st_npc_btn_clear_group').on('click', '#st_npc_btn_clear_group', (e) => {
        e.preventDefault();
        $('#st_npc_edit_group').val('').trigger('input');
        renderGroupTree();
    });

    // Add Custom Group / Sub-group
    $(document).off('click', '#st_npc_btn_add_custom_group').on('click', '#st_npc_btn_add_custom_group', (e) => {
        e.preventDefault();
        const parentInput = String($('#st_npc_new_parent_group').val() || '').trim();
        const subInput = String($('#st_npc_new_sub_group').val() || '').trim();

        if (!parentInput) {
            if (window.toastr) window.toastr.warning('Please enter a Group name.');
            $('#st_npc_new_parent_group').focus();
            return;
        }

        const newPath = subInput ? `${parentInput} / ${subInput}` : parentInput;
        if (!sessionCustomGroups.includes(newPath)) {
            sessionCustomGroups.push(newPath);
        }
        $('#st_npc_edit_group').val(newPath).trigger('input');
        $('#st_npc_new_parent_group').val('');
        $('#st_npc_new_sub_group').val('');
        renderGroupTree();
        if (window.toastr) window.toastr.success(`Selected group: ${newPath}`);
    });

    // Group input change -> sync tree checkboxes if panel is visible
    $(document).off('input', '#st_npc_edit_group').on('input', '#st_npc_edit_group', () => {
        if ($('#st_npc_group_tree_panel').is(':visible')) {
            renderGroupTree();
        }
    });

    // Parent group checkbox toggle
    $(document).off('click', '.st-npc-parent-cb').on('click', '.st-npc-parent-cb', function (e) {
        e.stopPropagation();
        const groupName = $(this).attr('data-group');
        const isChecked = $(this).prop('checked');
        if (isChecked) {
            $('#st_npc_edit_group').val(groupName).trigger('input');
        } else {
            $('#st_npc_edit_group').val('').trigger('input');
        }
        renderGroupTree();
    });

    // Parent row click (toggles parent checkbox)
    $(document).off('click', '.st-npc-tree-parent-node > .st-npc-tree-row').on('click', '.st-npc-tree-parent-node > .st-npc-tree-row', function (e) {
        if ($(e.target).is('input[type="checkbox"]')) return;
        const cb = $(this).find('.st-npc-parent-cb');
        cb.prop('checked', !cb.prop('checked')).trigger('click');
    });

    // Sub-group checkbox toggle
    $(document).off('click', '.st-npc-sub-cb').on('click', '.st-npc-sub-cb', function (e) {
        e.stopPropagation();
        const parent = $(this).attr('data-parent');
        const sub = $(this).attr('data-sub');
        const isChecked = $(this).prop('checked');
        if (isChecked) {
            $('#st_npc_edit_group').val(`${parent} / ${sub}`).trigger('input');
        } else {
            $('#st_npc_edit_group').val(parent).trigger('input');
        }
        renderGroupTree();
    });

    // Sub-group row click (toggles sub checkbox)
    $(document).off('click', '.st-npc-tree-sub-list > .st-npc-tree-row').on('click', '.st-npc-tree-sub-list > .st-npc-tree-row', function (e) {
        if ($(e.target).is('input[type="checkbox"]')) return;
        const cb = $(this).find('.st-npc-sub-cb');
        cb.prop('checked', !cb.prop('checked')).trigger('click');
    });

    // Template Preset selector change
    $(document).off('change', '#st_npc_modal_preset_select').on('change', '#st_npc_modal_preset_select', async function () {
        const targetPresetId = $(this).val();
        if (targetPresetId === currentPresetId) return;

        const context = SillyTavern.getContext();
        const settings = context.extensionSettings?.['npc_tracker'] || {};
        const preset = getPresetById(targetPresetId, settings.customTemplates || []);

        syncBlocksFromDom();
        const hasValues = currentBlocks.some((b) => b.value && b.value.trim());
        if (hasValues) {
            const proceed = await askUserConfirm(
                'Apply Template Preset',
                `Switching to "${preset.name}" will update your block attributes. Existing values for matching fields will be preserved. Proceed?`
            );
            if (!proceed) {
                $(this).val(currentPresetId);
                return;
            }
        }

        currentPresetId = targetPresetId;
        const newBlocks = generateBlocksFromPreset(preset);
        const oldValues = new Map();
        for (const b of currentBlocks) {
            if (b.value && b.value.trim()) {
                oldValues.set((b.id || '').toLowerCase(), b.value);
                oldValues.set((b.label || '').toLowerCase(), b.value);
            }
        }

        for (const nb of newBlocks) {
            const keyId = (nb.id || '').toLowerCase();
            const keyLabel = (nb.label || '').toLowerCase();
            if (oldValues.has(keyId)) {
                nb.value = oldValues.get(keyId);
            } else if (oldValues.has(keyLabel)) {
                nb.value = oldValues.get(keyLabel);
            }
        }

        currentBlocks = newBlocks;
        renderBlocks();

        const currentTemplateText = ($('#st_npc_edit_template_content').val() || '').trim();
        if (!currentTemplateText || !hasValues) {
            $('#st_npc_edit_template_content').val(preset.template || '');
        }

        if (window.toastr) window.toastr.success(`Applied template: ${preset.name}`);
    });

    // Token Helper Buttons
    $(document).off('click', '.st-npc-token-pill').on('click', '.st-npc-token-pill', function (e) {
        e.preventDefault();
        const token = $(this).data('token');
        const textarea = document.getElementById('st_npc_edit_template_content');
        if (textarea) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const text = textarea.value;
            textarea.value = text.substring(0, start) + token + text.substring(end);
            textarea.selectionStart = textarea.selectionEnd = start + token.length;
            textarea.focus();
        }
    });

    // Add Custom Block Button
    $(document).off('click', '#st_npc_btn_add_block').on('click', '#st_npc_btn_add_block', (e) => {
        e.preventDefault();
        addCustomBlock();
    });

    // Scope Link Buttons
    $(document).off('click', '#st_npc_btn_link_chat').on('click', '#st_npc_btn_link_chat', (e) => {
        e.preventDefault();
        addScopeLink('chat');
    });
    $(document).off('click', '#st_npc_btn_link_char').on('click', '#st_npc_btn_link_char', (e) => {
        e.preventDefault();
        addScopeLink('character');
    });
    $(document).off('click', '#st_npc_btn_link_persona').on('click', '#st_npc_btn_link_persona', (e) => {
        e.preventDefault();
        addScopeLink('persona');
    });
    $(document).off('click', '#st_npc_btn_link_global').on('click', '#st_npc_btn_link_global', (e) => {
        e.preventDefault();
        addScopeLink('global');
    });

    // Save Button
    $(document).off('click', '#st_npc_modal_save_btn').on('click', '#st_npc_modal_save_btn', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await saveNpcFromModal();
    });

    // Delete Button
    $(document).off('click', '#st_npc_modal_delete_btn').on('click', '#st_npc_modal_delete_btn', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await deleteNpcFromModal();
    });
}

/**
 * Returns current metadata and blocks from modal fields.
 */
function getModalFormData() {
    syncBlocksFromDom();
    return {
        name: String($('#st_npc_edit_name').val() || '').trim(),
        aliases: String($('#st_npc_edit_aliases').val() || '').trim(),
        group_name: String($('#st_npc_edit_group').val() || '').trim(),
        location_keywords: String($('#st_npc_edit_location').val() || '').trim(),
        blocks: currentBlocks,
    };
}

/**
 * Prompts user for confirmation using SillyTavern's popup API if available, falling back to window.confirm.
 */
async function askUserConfirm(title, message) {
    const safeTitle = escapeHtml(title);
    const safeMessage = escapeHtml(message);
    const context = SillyTavern.getContext();
    const Popup = context.Popup || (typeof window.Popup !== 'undefined' ? window.Popup : undefined);
    if (Popup?.show?.confirm) {
        try {
            return await Popup.show.confirm(safeTitle, safeMessage);
        } catch (_) {}
    }
    if (typeof context.callGenericPopup === 'function') {
        try {
            const res = await context.callGenericPopup(safeMessage, 1);
            return res === true || res === 1;
        } catch (_) {}
    }
    try {
        return window.confirm(message);
    } catch (_) {
        return false;
    }
}

/**
 * Handles switching tabs between Basic and Template with two-way data conversion.
 * @param {'basic'|'template'} targetTab
 */
async function handleTabSwitch(targetTab) {
    if (targetTab === currentMode) return;

    if (targetTab === 'template') {
        // Switching basic -> template
        syncBlocksFromDom();
        const currentTemplate = ($('#st_npc_edit_template_content').val() || '').trim();
        const formData = getModalFormData();

        if (!currentTemplate) {
            // Template is empty: generate cleanly from blocks without prompting
            const generated = blocksToTemplate(formData, { useTokens: true });
            $('#st_npc_edit_template_content').val(generated);
            if (window.toastr) window.toastr.info('Generated template from current blocks.');
        } else {
            // Template has content: ask before overwriting
            const overwrite = await askUserConfirm(
                'Update Freeform Template',
                'Overwrite freeform template with content generated from current blocks?'
            );
            if (overwrite) {
                const generated = blocksToTemplate(formData, { useTokens: true });
                $('#st_npc_edit_template_content').val(generated);
                if (window.toastr) window.toastr.success('Generated template from current blocks.');
            }
        }
        setEditorMode('template');
    } else {
        // Switching template -> basic
        const currentTemplate = ($('#st_npc_edit_template_content').val() || '').trim();

        if (currentTemplate) {
            const parseNow = await askUserConfirm(
                'Parse Template to Blocks',
                'Parse freeform template into blocks? This will update your blocks based on the template content.'
            );
            if (parseNow) {
                const parsed = templateToBlocks(currentTemplate, { blocks: currentBlocks });
                applyParsedDataToModal(parsed);
                if (window.toastr) window.toastr.success('Parsed template into blocks.');
            }
        }
        setEditorMode('basic');
    }
}

/**
 * Applies parsed template data (metadata and blocks) to modal inputs.
 * @param {Object} parsed
 */
function applyParsedDataToModal(parsed) {
    if (!parsed) return;
    if (parsed.name && !$('#st_npc_edit_name').val()) {
        $('#st_npc_edit_name').val(parsed.name);
    }
    if (parsed.aliases && !$('#st_npc_edit_aliases').val()) {
        $('#st_npc_edit_aliases').val(parsed.aliases);
    }
    if (parsed.group_name && !$('#st_npc_edit_group').val()) {
        $('#st_npc_edit_group').val(parsed.group_name);
    }
    if (parsed.location_keywords && !$('#st_npc_edit_location').val()) {
        $('#st_npc_edit_location').val(parsed.location_keywords);
    }
    if (Array.isArray(parsed.blocks) && parsed.blocks.length > 0) {
        currentBlocks = parsed.blocks;
        renderBlocks();
    }
}

/**
 * Switches between 'basic' and 'template' tabs.
 * @param {'basic'|'template'} mode
 */
function setEditorMode(mode) {
    currentMode = mode;
    $('.st-npc-tab-btn').removeClass('active');
    $(`.st-npc-tab-btn[data-tab="${mode}"]`).addClass('active');

    if (mode === 'basic') {
        $('#st_npc_tab_content_basic').show();
        $('#st_npc_tab_content_template').hide();
    } else {
        $('#st_npc_tab_content_basic').hide();
        $('#st_npc_tab_content_template').show();
    }
}

/**
 * Opens the NPC Editor Modal for a new or existing NPC.
 * @param {string|null} [npcId] - NPC UUID, or null for creating a new NPC.
 */
export async function openNpcEditorModal(npcId = null) {
    await initEditorModal();

    // Track whether extensions drawer is currently open so we can preserve it
    const extBlock = $('#rm_extensions_block');
    wasExtensionsDrawerOpen = extBlock.hasClass('openDrawer') || extBlock.is(':visible');

    currentNpcId = npcId;
    const context = SillyTavern.getContext();
    const settings = context.extensionSettings?.['npc_tracker'] || {};
    const customPresets = settings.customTemplates || [];
    const allPresets = getAllPresets(customPresets);

    // Populate Preset Selector in modal header
    const modalPresetSelect = $('#st_npc_modal_preset_select');
    modalPresetSelect.empty();
    for (const p of allPresets) {
        modalPresetSelect.append($('<option>').val(p.id).text(p.name));
    }

    // Reset Group Tree panel state
    $('#st_npc_group_tree_panel').hide();
    $('#st_npc_new_parent_group').val('');
    $('#st_npc_new_sub_group').val('');

    if (npcId) {
        // Edit existing NPC
        const npc = getNpcById(npcId);
        if (!npc) {
            console.error(`[NPC Tracker] NPC with ID ${npcId} not found.`);
            return;
        }

        currentPresetId = 'classic';
        modalPresetSelect.val('classic');

        $('#st_npc_modal_title').html(`<i class="fa-solid fa-user-pen"></i> Edit NPC: ${escapeHtml(npc.name)}`);
        $('#st_npc_edit_id').val(npc.id);
        $('#st_npc_edit_name').val(npc.name || '');
        $('#st_npc_edit_aliases').val(npc.aliases || '');
        $('#st_npc_edit_group').val(npc.group_name || '');
        $('#st_npc_edit_location').val(npc.location_keywords || '');
        $('#st_npc_edit_template_content').val(npc.raw_content || '');

        currentBlocks = Array.isArray(npc.blocks) && npc.blocks.length > 0 ? npc.blocks : getDefaultBlocks();
        currentLinks = getNpcScopes(npcId) || [];
        setEditorMode(npc.template_mode === 'template' ? 'template' : 'basic');
        $('#st_npc_modal_delete_btn').show();
    } else {
        // Create new NPC using the active default preset
        const activePresetId = settings.activeTemplateId || 'classic';
        currentPresetId = activePresetId;
        modalPresetSelect.val(activePresetId);
        const activePreset = getPresetById(activePresetId, customPresets);

        $('#st_npc_modal_title').html('<i class="fa-solid fa-user-plus"></i> Create New NPC');
        $('#st_npc_edit_id').val('');
        $('#st_npc_edit_name').val('');
        $('#st_npc_edit_aliases').val('');
        $('#st_npc_edit_group').val('');
        $('#st_npc_edit_location').val('');
        $('#st_npc_edit_template_content').val(activePreset.template || '');

        currentBlocks = generateBlocksFromPreset(activePreset);
        currentLinks = [];

        // By default, link to current chat if available
        if (context.chatId) {
            currentLinks.push({
                scope_type: 'chat',
                target_id: String(context.chatId),
                relationship_summary: '',
                is_active: 1,
            });
        }

        setEditorMode('basic');
        $('#st_npc_modal_delete_btn').hide();
    }

    renderBlocks();
    renderScopeLinks();
    renderGroupTree();

    $('#st_npc_modal_backdrop').fadeIn(150);
}

/**
 * Closes and hides the NPC Editor Modal.
 */
export function closeNpcEditorModal() {
    $('#st_npc_modal_backdrop').fadeOut(150);
    $('#st_npc_group_tree_panel').hide();
    currentNpcId = null;
    currentBlocks = [];
    currentLinks = [];

    // Reopen extensions drawer and NPC Tracker drawer if they were open before
    if (wasExtensionsDrawerOpen) {
        const extBlock = $('#rm_extensions_block');
        if (extBlock.length && (extBlock.hasClass('closedDrawer') || !extBlock.hasClass('openDrawer'))) {
            extBlock.removeClass('closedDrawer').addClass('openDrawer');
            $('#extensions-settings-button .drawer-icon').removeClass('closedIcon').addClass('openIcon');
        }
        const npcDrawerContent = $('#st_npc_settings_content');
        if (npcDrawerContent.length && npcDrawerContent.is(':hidden')) {
            npcDrawerContent.show();
            $('#st_npc_settings_drawer .inline-drawer-icon')
                .removeClass('down fa-circle-chevron-down')
                .addClass('up fa-circle-chevron-up');
        }
    }
}

/**
 * Builds the combined group hierarchy from DB plus any session-added groups.
 * @returns {Array<{ name: string, subGroups: string[] }>}
 */
function getCombinedGroupHierarchy() {
    const hierarchy = getNpcGroupHierarchy();
    const treeMap = new Map();

    for (const g of hierarchy) {
        treeMap.set(g.name, new Set(g.subGroups || []));
    }

    for (const custom of sessionCustomGroups) {
        const parts = custom.split('/').map((s) => s.trim()).filter(Boolean);
        if (parts.length === 0) continue;
        const parent = parts[0];
        if (!treeMap.has(parent)) {
            treeMap.set(parent, new Set());
        }
        if (parts.length > 1) {
            treeMap.get(parent).add(parts.slice(1).join(' / '));
        }
    }

    // Also include whatever is currently in #st_npc_edit_group if non-empty
    const currentInput = String($('#st_npc_edit_group').val() || '').trim();
    if (currentInput) {
        const parts = currentInput.split('/').map((s) => s.trim()).filter(Boolean);
        if (parts.length > 0) {
            const parent = parts[0];
            if (!treeMap.has(parent)) {
                treeMap.set(parent, new Set());
            }
            if (parts.length > 1) {
                treeMap.get(parent).add(parts.slice(1).join(' / '));
            }
        }
    }

    const result = [];
    for (const [name, subSet] of treeMap.entries()) {
        result.push({
            name,
            subGroups: Array.from(subSet).sort((a, b) => a.localeCompare(b)),
        });
    }

    return result.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Renders the hierarchical tree with checkboxes.
 */
function renderGroupTree() {
    const container = $('#st_npc_group_tree_container');
    if (!container.length) return;
    container.empty();

    const hierarchy = getCombinedGroupHierarchy();
    const currentVal = String($('#st_npc_edit_group').val() || '').trim();
    const parts = currentVal.split('/').map((s) => s.trim()).filter(Boolean);
    const activeParent = parts[0] || '';
    const activeSub = parts.slice(1).join(' / ') || '';

    if (hierarchy.length === 0) {
        container.html('<div class="st-npc-tree-empty">No groups found. Enter a new group above to add one.</div>');
        return;
    }

    for (const group of hierarchy) {
        const parentNode = $('<div>').addClass('st-npc-tree-parent-node');
        const isParentActive = activeParent === group.name;
        const isParentExact = isParentActive && !activeSub;

        // Parent row
        const parentRow = $('<div>')
            .addClass('st-npc-tree-row')
            .toggleClass('selected', isParentExact);

        const parentCb = $('<input>')
            .attr('type', 'checkbox')
            .addClass('st-npc-tree-checkbox st-npc-parent-cb')
            .prop('checked', isParentActive)
            .attr('data-group', group.name);

        const parentLabel = $('<span>')
            .addClass('st-npc-tree-label')
            .append($('<b>').text(group.name));

        parentRow.append(parentCb, parentLabel);
        parentNode.append(parentRow);

        // Sub-groups list
        if (Array.isArray(group.subGroups) && group.subGroups.length > 0) {
            const subList = $('<div>').addClass('st-npc-tree-sub-list');

            for (const sub of group.subGroups) {
                const isSubActive = isParentActive && activeSub === sub;
                const subRow = $('<div>')
                    .addClass('st-npc-tree-row')
                    .toggleClass('selected', isSubActive);

                const subCb = $('<input>')
                    .attr('type', 'checkbox')
                    .addClass('st-npc-tree-checkbox st-npc-sub-cb')
                    .prop('checked', isSubActive)
                    .attr('data-parent', group.name)
                    .attr('data-sub', sub);

                const subLabel = $('<span>')
                    .addClass('st-npc-tree-sub-label')
                    .text(sub);

                subRow.append(subCb, subLabel);
                subList.append(subRow);
            }

            parentNode.append(subList);
        }

        container.append(parentNode);
    }
}

/**
 * Returns standard starting blocks.
 */
function getDefaultBlocks() {
    return DEFAULT_BLOCKS.map((b) => ({ ...b }));
}

/**
 * Renders the block editor cards.
 */
function renderBlocks() {
    const container = $('#st_npc_blocks_list');
    container.empty();

    currentBlocks.forEach((block, index) => {
        const isStandard = STANDARD_BLOCK_IDS.has(block.id);
        const label = block.label || block.id || '';
        const value = block.value || '';

        const card = $('<div>').addClass('st-npc-block-card').attr('data-index', index);
        const header = $('<div>').addClass('st-npc-block-header');
        const titleRow = $('<div>').addClass('st-npc-block-title-row');

        const dragHandle = $('<span>').addClass('st-npc-block-drag-handle').append($('<i>').addClass('fa-solid fa-grip-vertical'));
        titleRow.append(dragHandle);

        if (isStandard) {
            const fixedLabel = $('<span>').addClass('st-npc-block-label-fixed').append($('<b>').text(label));
            titleRow.append(fixedLabel);
        } else {
            const labelInput = $('<input>')
                .attr('type', 'text')
                .addClass('text_pole st-npc-block-label-input')
                .val(label)
                .attr('placeholder', 'Block Name');
            titleRow.append(labelInput);
        }

        const actions = $('<div>').addClass('st-npc-block-actions');
        const btnUp = $('<button>')
            .attr('type', 'button')
            .addClass('st-npc-btn-reorder')
            .attr('data-dir', 'up')
            .attr('title', 'Move Up')
            .prop('disabled', index === 0)
            .append($('<i>').addClass('fa-solid fa-arrow-up'));
        const btnDown = $('<button>')
            .attr('type', 'button')
            .addClass('st-npc-btn-reorder')
            .attr('data-dir', 'down')
            .attr('title', 'Move Down')
            .prop('disabled', index === currentBlocks.length - 1)
            .append($('<i>').addClass('fa-solid fa-arrow-down'));
        actions.append(btnUp, btnDown);

        if (!isStandard) {
            const btnDelete = $('<button>')
                .attr('type', 'button')
                .addClass('st-npc-btn-delete-block')
                .attr('title', 'Delete Block')
                .append($('<i>').addClass('fa-solid fa-trash'));
            actions.append(btnDelete);
        }

        header.append(titleRow, actions);

        const body = $('<div>').addClass('st-npc-block-body');
        const textarea = $('<textarea>')
            .addClass('text_pole st-npc-block-textarea')
            .attr('rows', '2')
            .attr('placeholder', `Enter ${label.toLowerCase()} details...`)
            .val(value);
        body.append(textarea);

        card.append(header, body);
        container.append(card);
    });

    // Bind block events
    container.find('.st-npc-block-textarea').on('input', function () {
        const idx = $(this).closest('.st-npc-block-card').data('index');
        if (currentBlocks[idx]) {
            currentBlocks[idx].value = $(this).val();
        }
    });

    container.find('.st-npc-block-label-input').on('input', function () {
        const idx = $(this).closest('.st-npc-block-card').data('index');
        if (currentBlocks[idx]) {
            currentBlocks[idx].label = $(this).val();
        }
    });

    container.find('.st-npc-btn-reorder').on('click', function () {
        const idx = $(this).closest('.st-npc-block-card').data('index');
        const dir = $(this).data('dir');
        syncBlocksFromDom();
        if (dir === 'up' && idx > 0) {
            const temp = currentBlocks[idx];
            currentBlocks[idx] = currentBlocks[idx - 1];
            currentBlocks[idx - 1] = temp;
            renderBlocks();
        } else if (dir === 'down' && idx < currentBlocks.length - 1) {
            const temp = currentBlocks[idx];
            currentBlocks[idx] = currentBlocks[idx + 1];
            currentBlocks[idx + 1] = temp;
            renderBlocks();
        }
    });

    container.find('.st-npc-btn-delete-block').on('click', function () {
        const idx = $(this).closest('.st-npc-block-card').data('index');
        syncBlocksFromDom();
        currentBlocks.splice(idx, 1);
        renderBlocks();
    });
}

/**
 * Synchronizes in-memory currentBlocks from current DOM inputs.
 */
function syncBlocksFromDom() {
    $('#st_npc_blocks_list .st-npc-block-card').each(function () {
        const idx = $(this).data('index');
        if (currentBlocks[idx]) {
            const labelInput = $(this).find('.st-npc-block-label-input');
            if (labelInput.length) {
                currentBlocks[idx].label = labelInput.val();
            }
            const textarea = $(this).find('.st-npc-block-textarea');
            currentBlocks[idx].value = textarea.val();
        }
    });
}

/**
 * Appends a custom block to currentBlocks.
 */
function addCustomBlock() {
    syncBlocksFromDom();
    const id = `custom_${Date.now()}`;
    currentBlocks.push({
        id,
        label: 'Custom Detail',
        type: 'text',
        value: '',
    });
    renderBlocks();
}

/**
 * Adds a new scope link for this NPC.
 * @param {'chat'|'character'|'persona'|'global'} scopeType
 */
function addScopeLink(scopeType) {
    const context = SillyTavern.getContext();
    const targetId = resolveScopeTarget(scopeType, context);
    if (!targetId && scopeType !== 'global') {
        if (window.toastr) window.toastr.warning(`No active ${scopeType} loaded.`);
        return;
    }

    let label = targetId;
    if (scopeType === 'chat') {
        label = `Chat: ${targetId.slice(0, 12)}...`;
    } else if (scopeType === 'character') {
        const char = context.characterId !== undefined && context.characters?.[context.characterId];
        label = `Char: ${char?.name || targetId}`;
    } else if (scopeType === 'persona') {
        label = `Persona: ${targetId}`;
    } else {
        label = 'Global Scope';
    }

    // Check duplicate
    const exists = currentLinks.some((l) => l.scope_type === scopeType && String(l.target_id) === targetId);
    if (exists) {
        if (window.toastr) window.toastr.info('Link to this target already exists.');
        return;
    }

    currentLinks.push({
        scope_type: scopeType,
        target_id: targetId,
        relationship_summary: '',
        is_active: 1,
    });

    renderScopeLinks();
}

/**
 * Renders the scope links rows in the modal.
 */
function renderScopeLinks() {
    const container = $('#st_npc_modal_scopes_list');
    container.empty();

    if (currentLinks.length === 0) {
        container.html('<div class="st-npc-empty-notice">No scopes linked yet. (NPC will not inject into prompt until linked).</div>');
        return;
    }

    currentLinks.forEach((link, idx) => {
        const safeScope = escapeHtml(link.scope_type);
        const safeTarget = escapeHtml(String(link.target_id));
        const safeSummary = escapeAttr(link.relationship_summary || '');
        const isActive = link.is_active !== 0;

        const rowHtml = `
            <div class="st-npc-scope-item" data-link-idx="${idx}">
                <div class="st-npc-scope-left">
                    <input type="checkbox" class="checkbox st-npc-scope-toggle" ${isActive ? 'checked' : ''} title="Toggle active in prompt" />
                    <span class="st-npc-badge info">${safeScope}</span>
                    <span class="st-npc-scope-target" title="${safeTarget}">${safeTarget.length > 25 ? safeTarget.slice(0, 22) + '...' : safeTarget}</span>
                </div>
                <div class="st-npc-scope-right">
                    <input type="text" class="text_pole st-npc-scope-affinity" value="${safeSummary}" placeholder="Affinity / notes" />
                    <button type="button" class="st-npc-btn-unlink" title="Remove Link"><i class="fa-solid fa-xmark"></i></button>
                </div>
            </div>
        `;
        container.append(rowHtml);
    });

    container.find('.st-npc-scope-toggle').on('change', function () {
        const idx = $(this).closest('.st-npc-scope-item').data('link-idx');
        if (currentLinks[idx]) {
            currentLinks[idx].is_active = $(this).prop('checked') ? 1 : 0;
        }
    });

    container.find('.st-npc-scope-affinity').on('input', function () {
        const idx = $(this).closest('.st-npc-scope-item').data('link-idx');
        if (currentLinks[idx]) {
            currentLinks[idx].relationship_summary = $(this).val();
        }
    });

    container.find('.st-npc-btn-unlink').on('click', function () {
        const idx = $(this).closest('.st-npc-scope-item').data('link-idx');
        currentLinks.splice(idx, 1);
        renderScopeLinks();
    });
}

/**
 * Saves the NPC from the modal into the database store.
 */
async function saveNpcFromModal() {
    syncBlocksFromDom();

    const name = String($('#st_npc_edit_name').val() || '').trim();
    if (!name) {
        if (window.toastr) window.toastr.warning('Please enter an NPC Name.');
        $('#st_npc_edit_name').focus();
        return;
    }

    const aliases = String($('#st_npc_edit_aliases').val() || '').trim();
    const groupName = String($('#st_npc_edit_group').val() || '').trim();
    const locationKeywords = String($('#st_npc_edit_location').val() || '').trim();
    let rawContent = String($('#st_npc_edit_template_content').val() || '').trim();

    if (currentMode === 'basic' && !rawContent) {
        rawContent = blocksToTemplate(
            {
                name,
                aliases,
                group_name: groupName,
                location_keywords: locationKeywords,
                blocks: currentBlocks,
            },
            { useTokens: true }
        );
    } else if (currentMode === 'template' && rawContent) {
        const parsed = templateToBlocks(rawContent, { blocks: currentBlocks });
        currentBlocks = parsed.blocks;
    }

    const payload = {
        name,
        aliases,
        group_name: groupName,
        location_keywords: locationKeywords,
        template_mode: currentMode,
        blocks: currentBlocks,
        raw_content: rawContent,
    };

    try {
        if (currentNpcId) {
            // Update existing
            updateNpc(currentNpcId, payload);

            // Diff against getNpcScopes(id): delete removed links, then upsert the rest
            const existingScopes = getNpcScopes(currentNpcId);
            for (const es of existingScopes) {
                const stillPresent = currentLinks.some(
                    (cl) => cl.scope_type === es.scope_type && String(cl.target_id) === String(es.target_id)
                );
                if (!stillPresent) {
                    unlinkNpcScope(currentNpcId, es.scope_type, es.target_id);
                }
            }

            for (const link of currentLinks) {
                const active = link.is_active !== 0 ? 1 : 0;
                linkNpcScope(currentNpcId, link.scope_type, link.target_id, link.relationship_summary || '', active);
            }

            if (window.toastr) window.toastr.success(`Updated NPC: ${name}`);
        } else {
            // Create new
            const newId = createNpc(payload, currentLinks);
            currentNpcId = newId;
            if (window.toastr) window.toastr.success(`Created NPC: ${name}`);
        }

        syncPromptInjection();
        if (typeof onModalSavedCallback === 'function') {
            onModalSavedCallback();
        }

        closeNpcEditorModal();
    } catch (err) {
        console.error('[NPC Tracker] Failed to save NPC:', err);
        if (window.toastr) window.toastr.error(`Save failed: ${err.message}`);
    }
}

let deleteConfirmTimeout = null;

/**
 * Deletes current NPC from database after confirmation.
 */
async function deleteNpcFromModal() {
    if (!currentNpcId) return;

    const name = $('#st_npc_edit_name').val() || 'this NPC';
    const confirmed = await askUserConfirm(
        'Delete NPC',
        `Are you sure you want to delete "${name}"? This cannot be undone.`
    );
    if (confirmed) {
        await executeModalDelete(currentNpcId, name);
    }
}

/**
 * Executes the database deletion, saves, updates prompt, and closes modal.
 * @param {string} npcId
 * @param {string} name
 */
async function executeModalDelete(npcId, name) {
    try {
        deleteNpc(npcId);
        syncPromptInjection();
        if (window.toastr) window.toastr.success(`Deleted ${name}`);

        if (typeof onModalSavedCallback === 'function') {
            onModalSavedCallback();
        }

        closeNpcEditorModal();
    } catch (err) {
        console.error('[NPC Tracker] Failed to delete NPC:', err);
        if (window.toastr) window.toastr.error(`Delete failed: ${err.message}`);
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttr(str) {
    if (!str) return '';
    return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
