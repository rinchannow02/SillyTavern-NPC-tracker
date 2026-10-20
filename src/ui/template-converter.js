/**
 * @file src/ui/template-converter.js
 * @description Bidirectional conversion between structured NPC blocks and freeform markdown templates.
 */

const STANDARD_BLOCK_KEYS = {
    appearance: 'appearance',
    looks: 'appearance',
    visual: 'appearance',
    look: 'appearance',
    personality: 'personality',
    traits: 'personality',
    behavior: 'personality',
    character: 'personality',
    relationship: 'relationship',
    relationships: 'relationship',
    affinity: 'relationship',
    'context affinity': 'relationship',
    tone: 'speech_style',
    'speaking style': 'speech_style',
    'speech style': 'speech_style',
    'dialogue style': 'speech_style',
    dialogue: 'speech_style',
    mannerisms: 'speech_style',
    'tone & speaking style': 'speech_style',
    'speaking style & dialect': 'speech_style',
    'street slang & demeanor': 'speech_style',
    bio: 'bio',
    'short bio': 'bio',
    'short bio & background': 'bio',
    'short bio & lore': 'bio',
    'short bio & dossier': 'bio',
    backstory: 'bio',
    background: 'bio',
};

/**
 * Converts structured NPC data and blocks into a freeform markdown template.
 *
 * @param {Object} npcData
 * @param {string} [npcData.name]
 * @param {string} [npcData.aliases]
 * @param {string} [npcData.group_name]
 * @param {string} [npcData.location_keywords]
 * @param {Array<Object>} [npcData.blocks]
 * @param {string} [npcData.relationship_summary]
 * @param {Object} [options]
 * @param {boolean} [options.useTokens=true] - Whether to use tokens like {{name}} for metadata fields.
 * @returns {string} Formatted markdown text.
 */
export function blocksToTemplate(npcData = {}, options = {}) {
    const { useTokens = true } = options;
    const lines = [];

    // Header line
    const nameToken = useTokens ? '{{name}}' : (npcData.name || '');
    const aliasToken = useTokens ? '{{aliases}}' : (npcData.aliases || '');
    const groupToken = useTokens ? '{{group}}' : (npcData.group_name || '');
    const locationToken = useTokens ? '{{location}}' : (npcData.location_keywords || '');

    let header = `### NPC: ${nameToken}`;
    if (npcData.aliases) {
        header += ` (${aliasToken})`;
    }

    if (npcData.group_name) {
        header += ` [Group: ${groupToken}]`;
    }
    lines.push(header);

    // Location line
    if (npcData.location_keywords) {
        lines.push(`- **Location/Setting:** ${locationToken}`);
    }

    // Blocks
    const blocks = Array.isArray(npcData.blocks) ? npcData.blocks : [];
    const renderedIds = new Set();

    for (const block of blocks) {
        if (!block) continue;
        const id = (block.id || '').toLowerCase();
        const label = block.label || block.id || 'Detail';
        const val = block.value !== undefined && block.value !== null ? String(block.value).trim() : '';

        renderedIds.add(id);

        if (!val) {
            lines.push(`- **${label}:**`);
            continue;
        }

        // If multiline, indent nicely
        if (val.includes('\n')) {
            const indented = val
                .split('\n')
                .map((line) => `  ${line}`)
                .join('\n');
            lines.push(`- **${label}:**\n${indented}`);
        } else {
            lines.push(`- **${label}:** ${val}`);
        }
    }

    // If standard blocks were missing from the blocks list, add empty placeholders
    if (!renderedIds.has('appearance')) {
        lines.push('- **Appearance:**');
    }
    if (!renderedIds.has('personality')) {
        lines.push('- **Personality:**');
    }
    if (!renderedIds.has('relationship')) {
        const relVal = npcData.relationship_summary ? String(npcData.relationship_summary).trim() : '';
        lines.push(relVal ? `- **Relationship:** ${relVal}` : '- **Relationship:**');
    }

    return lines.join('\n');
}

/**
 * Parses freeform markdown template text into structured NPC metadata and blocks.
 *
 * @param {string} templateText - Raw markdown text to parse.
 * @param {Object} [currentNpc] - Existing NPC data to preserve or fall back to.
 * @returns {{
 *   name?: string,
 *   aliases?: string,
 *   group_name?: string,
 *   location_keywords?: string,
 *   blocks: Array<{ id: string, label: string, value: string, type: string }>,
 *   metadataUpdated: boolean
 * }}
 */
export function templateToBlocks(templateText = '', currentNpc = {}) {
    const text = String(templateText || '').trim();

    const standardBlocks = {
        appearance: { id: 'appearance', label: 'Appearance', value: '', type: 'text' },
        personality: { id: 'personality', label: 'Personality', value: '', type: 'text' },
        relationship: { id: 'relationship', label: 'Relationship', value: '', type: 'text' },
        speech_style: { id: 'speech_style', label: 'Tone & Speaking Style', value: '', type: 'text' },
        bio: { id: 'bio', label: 'Short Bio', value: '', type: 'text' },
    };

    // If currentNpc already had standard blocks, preserve their current values as initial defaults
    if (Array.isArray(currentNpc.blocks)) {
        for (const b of currentNpc.blocks) {
            const key = (b.id || '').toLowerCase();
            if (standardBlocks[key]) {
                standardBlocks[key].label = b.label || standardBlocks[key].label;
                standardBlocks[key].value = b.value || '';
            }
        }
    }

    const customBlocks = [];
    const customMap = new Map();

    const result = {
        name: undefined,
        aliases: undefined,
        group_name: undefined,
        location_keywords: undefined,
        metadataUpdated: false,
    };

    if (!text) {
        const defaultEmpty = [standardBlocks.appearance, standardBlocks.personality];
        if (Array.isArray(currentNpc.blocks) && currentNpc.blocks.some((b) => b.id === 'speech_style')) {
            defaultEmpty.push(standardBlocks.speech_style);
        }
        defaultEmpty.push(standardBlocks.relationship);
        if (Array.isArray(currentNpc.blocks) && currentNpc.blocks.some((b) => b.id === 'bio')) {
            defaultEmpty.push(standardBlocks.bio);
        }
        return {
            ...result,
            blocks: defaultEmpty,
        };
    }

    const orderedBlocks = [];
    const lines = text.split(/\r?\n/);
    let currentBlock = null;
    let pendingLines = [];

    function flushCurrentBlock() {
        if (!currentBlock) {
            if (pendingLines.length > 0) {
                const unlabelledText = pendingLines.join('\n').trim();
                if (unlabelledText) {
                    const blockId = `custom_${Date.now()}_${customBlocks.length}`;
                    const notesBlock = {
                        id: blockId,
                        label: 'Notes',
                        value: unlabelledText,
                        type: 'text',
                    };
                    customBlocks.push(notesBlock);
                    orderedBlocks.push(notesBlock);
                }
                pendingLines = [];
            }
            return;
        }

        const fullVal = pendingLines.join('\n').trim();
        // Ignore if the value is merely a token placeholder matching the label (e.g. {{appearance}})
        const isSelfToken = fullVal.match(/^\{\{[\w-]+\}\}$/i);
        if (!isSelfToken && fullVal) {
            currentBlock.value = fullVal;
        }

        pendingLines = [];
        currentBlock = null;
    }

    for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];
        const trimmed = rawLine.trim();

        if (!trimmed) {
            if (currentBlock) {
                pendingLines.push('');
            }
            continue;
        }

        // 1. Check for Top NPC Header line: ### NPC: Name (Aliases) [Group: GroupName]
        const npcHeaderMatch = trimmed.match(/^#{1,6}\s+NPC:\s*(.+)$/i);
        if (npcHeaderMatch) {
            flushCurrentBlock();
            const rawTitle = npcHeaderMatch[1].trim();

            let withoutGroup = rawTitle;
            const groupMatch = rawTitle.match(/\[(?:Group:\s*)?([^\]]+)\]/i);
            if (groupMatch) {
                const grp = groupMatch[1].trim();
                if (grp && !grp.startsWith('{{')) {
                    result.group_name = grp;
                    result.metadataUpdated = true;
                }
                withoutGroup = rawTitle.replace(groupMatch[0], '').trim();
            }

            let parsedName = withoutGroup;
            const aliasMatch = withoutGroup.match(/\(([^)]+)\)/);
            if (aliasMatch) {
                const als = aliasMatch[1].trim();
                if (als && !als.startsWith('{{')) {
                    result.aliases = als;
                    result.metadataUpdated = true;
                }
                parsedName = withoutGroup.replace(aliasMatch[0], '').trim();
            }

            if (parsedName && !parsedName.startsWith('{{')) {
                result.name = parsedName;
                result.metadataUpdated = true;
            }
            continue;
        }

        // 2. Check for Markdown Header Block: ### Appearance or ## Race & Class
        const headerBlockMatch = trimmed.match(/^#{2,6}\s+([^:*#\n]+?):?$/);
        if (headerBlockMatch) {
            flushCurrentBlock();
            const label = headerBlockMatch[1].trim();
            const lowerLabel = label.toLowerCase();
            const standardKey = STANDARD_BLOCK_KEYS[lowerLabel];

            if (standardKey && standardBlocks[standardKey]) {
                currentBlock = standardBlocks[standardKey];
            } else {
                let cb = customMap.get(lowerLabel);
                if (!cb) {
                    const existingBlock = Array.isArray(currentNpc.blocks)
                        ? currentNpc.blocks.find(
                              (b) =>
                                  (b.label && b.label.toLowerCase() === lowerLabel) ||
                                  (b.id && b.id.toLowerCase() === lowerLabel)
                          )
                        : null;

                    cb = {
                        id: existingBlock?.id || `custom_${Date.now()}_${customBlocks.length}`,
                        label: existingBlock?.label || label,
                        value: '',
                        type: existingBlock?.type || 'text',
                    };
                    customBlocks.push(cb);
                    customMap.set(lowerLabel, cb);
                }
                currentBlock = cb;
            }
            if (!orderedBlocks.includes(currentBlock)) {
                orderedBlocks.push(currentBlock);
            }
            continue;
        }

        // Clean bullet list prefix for key-value extraction
        let cleanLine = trimmed;
        const isBullet = /^[-*+]\s+/.test(cleanLine);
        if (isBullet) {
            cleanLine = cleanLine.replace(/^[-*+]\s+/, '').trim();
        }

        // 3. Check for Location/Setting line: **Location/Setting:** loc or **Location/Setting**: loc or Location/Setting: loc
        const locMatch = cleanLine.match(/^\*{0,2}(?:Location(?:[\s\/_-]?Setting)?)(?::\*{1,2}|\*{0,2}:)\s*(.*)$/i);
        if (locMatch) {
            flushCurrentBlock();
            let locVal = locMatch[1].trim();
            locVal = locVal.replace(/^\*{1,2}|\*{1,2}$/g, '').trim();
            if (locVal && !locVal.startsWith('{{')) {
                result.location_keywords = locVal;
                result.metadataUpdated = true;
            }
            continue;
        }

        // 4. Check for Bold or standard Key-Value block: **Label:** Value or **Label**: Value or Label: Value
        let blockMatch = cleanLine.match(/^\*{1,2}([^*\n:]+?)(?::\*{1,2}|\*{1,2}:)\s*(.*)$/);
        if (!blockMatch && isBullet) {
            blockMatch = cleanLine.match(/^([^*\n:]+?):\s*(.*)$/);
        }

        if (blockMatch) {
            const rawLabel = blockMatch[1].trim();
            let immediateValue = blockMatch[2] ? blockMatch[2].trim() : '';
            immediateValue = immediateValue.replace(/^\*{1,2}|\*{1,2}$/g, '').trim();
            const lowerLabel = rawLabel.toLowerCase();

            flushCurrentBlock();

            const standardKey = STANDARD_BLOCK_KEYS[lowerLabel];
            if (standardKey && standardBlocks[standardKey]) {
                currentBlock = standardBlocks[standardKey];
            } else {
                let cb = customMap.get(lowerLabel);
                if (!cb) {
                    const existingBlock = Array.isArray(currentNpc.blocks)
                        ? currentNpc.blocks.find(
                              (b) =>
                                  (b.label && b.label.toLowerCase() === lowerLabel) ||
                                  (b.id && b.id.toLowerCase() === lowerLabel)
                          )
                        : null;

                    cb = {
                        id: existingBlock?.id || `custom_${Date.now()}_${customBlocks.length}`,
                        label: existingBlock?.label || rawLabel,
                        value: '',
                        type: existingBlock?.type || 'text',
                    };
                    customBlocks.push(cb);
                    customMap.set(lowerLabel, cb);
                }
                currentBlock = cb;
            }

            if (!orderedBlocks.includes(currentBlock)) {
                orderedBlocks.push(currentBlock);
            }

            if (immediateValue) {
                pendingLines.push(immediateValue);
            }
            continue;
        }

        // 5. Continuation lines for the active block or unlabelled text
        if (currentBlock) {
            const deindented = rawLine.replace(/^\s{2,4}/, '');
            pendingLines.push(deindented);
        } else {
            pendingLines.push(trimmed);
        }
    }

    flushCurrentBlock();

    const finalBlocks = [...orderedBlocks];
    const presentIds = new Set(finalBlocks.map((b) => b.id));

    if (!presentIds.has('appearance')) finalBlocks.push(standardBlocks.appearance);
    if (!presentIds.has('personality')) finalBlocks.push(standardBlocks.personality);
    if (standardBlocks.speech_style.value || (Array.isArray(currentNpc.blocks) && currentNpc.blocks.some((b) => b.id === 'speech_style'))) {
        if (!presentIds.has('speech_style')) finalBlocks.push(standardBlocks.speech_style);
    }
    if (!presentIds.has('relationship')) finalBlocks.push(standardBlocks.relationship);
    if (standardBlocks.bio.value || (Array.isArray(currentNpc.blocks) && currentNpc.blocks.some((b) => b.id === 'bio'))) {
        if (!presentIds.has('bio')) finalBlocks.push(standardBlocks.bio);
    }

    return {
        ...result,
        blocks: finalBlocks,
    };
}
