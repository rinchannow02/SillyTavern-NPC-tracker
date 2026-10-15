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
} from '../db/sqlite-store.js';

import { syncPromptInjection } from '../injection.js';

let modalInitialized = false;
let currentNpcId = null;
let currentBlocks = [];
let currentLinks = [];
let currentMode = 'basic';
let onModalSavedCallback = null;

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

    // Tab Bar Switching
    $(document).off('click', '.st-npc-tab-btn').on('click', '.st-npc-tab-btn', function (e) {
        e.preventDefault();
        const tab = $(this).data('tab');
        setEditorMode(tab);
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

    // Populate Groups Datalist
    try {
        const groups = getNpcGroups();
        const datalist = document.getElementById('st_npc_group_datalist');
        if (datalist) {
            datalist.innerHTML = groups.map((g) => `<option value="${escapeAttr(g)}"></option>`).join('');
        }
    } catch (_) {}

    if (npcId) {
        // Edit existing NPC
        const npc = getNpcById(npcId);
        if (!npc) {
            console.error(`[NPC Tracker] NPC with ID ${npcId} not found.`);
            return;
        }

        $('#st_npc_modal_title').html(`<i class="fa-solid fa-user-pen"></i> Edit NPC: ${escapeHtml(npc.name)}`);
        $('#st_npc_edit_id').val(npc.id);
        $('#st_npc_edit_name').val(npc.name || '');
        $('#st_npc_edit_aliases').val(npc.aliases || '');
        $('#st_npc_edit_group').val(npc.group_name || '');
        $('#st_npc_edit_location').val(npc.location_keywords || '');
        $('#st_npc_edit_avatar').val(npc.avatar || '');
        $('#st_npc_edit_template_content').val(npc.raw_content || '');

        currentBlocks = Array.isArray(npc.blocks) && npc.blocks.length > 0 ? npc.blocks : getDefaultBlocks();
        currentLinks = getNpcScopes(npcId) || [];
        setEditorMode(npc.template_mode === 'template' ? 'template' : 'basic');
        $('#st_npc_modal_delete_btn').show();
    } else {
        // Create new NPC
        $('#st_npc_modal_title').html('<i class="fa-solid fa-user-plus"></i> Create New NPC');
        $('#st_npc_edit_id').val('');
        $('#st_npc_edit_name').val('');
        $('#st_npc_edit_aliases').val('');
        $('#st_npc_edit_group').val('');
        $('#st_npc_edit_location').val('');
        $('#st_npc_edit_avatar').val('');
        $('#st_npc_edit_template_content').val('');

        currentBlocks = getDefaultBlocks();
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

    $('#st_npc_modal_backdrop').fadeIn(150);
}

/**
 * Closes and hides the NPC Editor Modal.
 */
export function closeNpcEditorModal() {
    $('#st_npc_modal_backdrop').fadeOut(150);
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
 * Returns standard starting blocks.
 */
function getDefaultBlocks() {
    return [
        { id: 'appearance', label: 'Appearance', type: 'text', value: '' },
        { id: 'personality', label: 'Personality', type: 'text', value: '' },
        { id: 'relationship', label: 'Relationship', type: 'text', value: '' },
    ];
}

/**
 * Renders the block editor cards.
 */
function renderBlocks() {
    const container = $('#st_npc_blocks_list');
    container.empty();

    const { DOMPurify } = SillyTavern.libs;

    currentBlocks.forEach((block, index) => {
        const isStandard = STANDARD_BLOCK_IDS.has(block.id);
        const safeLabel = DOMPurify.sanitize(block.label || block.id);
        const safeValue = DOMPurify.sanitize(block.value || '');

        const blockHtml = `
            <div class="st-npc-block-card" data-index="${index}">
                <div class="st-npc-block-header">
                    <div class="st-npc-block-title-row">
                        <span class="st-npc-block-drag-handle"><i class="fa-solid fa-grip-vertical"></i></span>
                        ${
                            isStandard
                                ? `<span class="st-npc-block-label-fixed"><b>${safeLabel}</b></span>`
                                : `<input type="text" class="text_pole st-npc-block-label-input" value="${escapeAttr(block.label)}" placeholder="Block Name" />`
                        }
                    </div>
                    <div class="st-npc-block-actions">
                        <button type="button" class="st-npc-btn-reorder" data-dir="up" title="Move Up" ${index === 0 ? 'disabled' : ''}>
                            <i class="fa-solid fa-arrow-up"></i>
                        </button>
                        <button type="button" class="st-npc-btn-reorder" data-dir="down" title="Move Down" ${index === currentBlocks.length - 1 ? 'disabled' : ''}>
                            <i class="fa-solid fa-arrow-down"></i>
                        </button>
                        ${
                            !isStandard
                                ? `<button type="button" class="st-npc-btn-delete-block" title="Delete Block"><i class="fa-solid fa-trash"></i></button>`
                                : ''
                        }
                    </div>
                </div>
                <div class="st-npc-block-body">
                    <textarea class="text_pole st-npc-block-textarea" rows="2" placeholder="Enter ${safeLabel.toLowerCase()} details...">${safeValue}</textarea>
                </div>
            </div>
        `;
        container.append(blockHtml);
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
    let targetId = 'global';
    let label = 'Global Scope';

    if (scopeType === 'chat') {
        if (!context.chatId) {
            if (window.toastr) window.toastr.warning('No chat is currently active.');
            return;
        }
        targetId = String(context.chatId);
        label = `Chat: ${targetId.slice(0, 12)}...`;
    } else if (scopeType === 'character') {
        const char = context.characterId !== undefined && context.characters?.[context.characterId];
        if (!char) {
            if (window.toastr) window.toastr.warning('No character currently loaded.');
            return;
        }
        targetId = String(char.avatar || char.name);
        label = `Char: ${char.name || targetId}`;
    } else if (scopeType === 'persona') {
        const persona = context.powerUserSettings?.persona_selected;
        if (!persona) {
            if (window.toastr) window.toastr.warning('No persona currently selected.');
            return;
        }
        targetId = String(persona);
        label = `Persona: ${persona}`;
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
            if (currentLinks[idx].id) {
                setNpcScopeStatus(currentLinks[idx].id, currentLinks[idx].is_active);
            }
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
        const link = currentLinks[idx];
        if (currentNpcId && link) {
            unlinkNpcScope(currentNpcId, link.scope_type, link.target_id);
        }
        currentLinks.splice(idx, 1);
        renderScopeLinks();
    });
}

/**
 * Saves the NPC from the modal into SQLite.
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
    const avatar = String($('#st_npc_edit_avatar').val() || '').trim();
    const rawContent = String($('#st_npc_edit_template_content').val() || '').trim();

    const payload = {
        name,
        aliases,
        group_name: groupName,
        location_keywords: locationKeywords,
        avatar,
        template_mode: currentMode,
        blocks: currentBlocks,
        raw_content: rawContent,
    };

    try {
        if (currentNpcId) {
            // Update existing
            updateNpc(currentNpcId, payload);

            // Re-sync all currentLinks
            for (const link of currentLinks) {
                linkNpcScope(currentNpcId, link.scope_type, link.target_id, link.relationship_summary);
                if (link.is_active === 0) {
                    const scopes = getNpcScopes(currentNpcId);
                    const saved = scopes.find((s) => s.scope_type === link.scope_type && s.target_id === link.target_id);
                    if (saved) setNpcScopeStatus(saved.id, 0);
                }
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

    const btn = $('#st_npc_modal_delete_btn');
    const name = $('#st_npc_edit_name').val() || 'this NPC';

    // 1. Try SillyTavern's native Popup.show.confirm if available
    if (typeof Popup !== 'undefined' && Popup.show?.confirm) {
        try {
            const confirmed = await Popup.show.confirm(
                'Delete NPC',
                `Are you sure you want to delete "${name}"? This cannot be undone.`
            );
            if (confirmed) {
                await executeModalDelete(currentNpcId, name);
            }
            return;
        } catch (_) {}
    }

    // 2. Inline 2-click confirmation fallback (immune to blocked browser alert/confirm dialogs)
    if (!btn.hasClass('confirm-delete')) {
        btn.addClass('confirm-delete').html('<i class="fa-solid fa-triangle-exclamation"></i> Really Delete?');
        if (deleteConfirmTimeout) clearTimeout(deleteConfirmTimeout);
        deleteConfirmTimeout = setTimeout(() => {
            btn.removeClass('confirm-delete').html('<i class="fa-solid fa-trash-can"></i> Delete NPC');
        }, 4000);
        return;
    }

    if (deleteConfirmTimeout) clearTimeout(deleteConfirmTimeout);
    btn.removeClass('confirm-delete').html('<i class="fa-solid fa-trash-can"></i> Delete NPC');
    await executeModalDelete(currentNpcId, name);
}

/**
 * Executes the database deletion, saves, updates prompt, and closes modal.
 * @param {string} npcId
 * @param {string} name
 */
async function executeModalDelete(npcId, name) {
    try {
        deleteNpc(npcId);
        await saveDatabaseNow();
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
