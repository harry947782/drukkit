        var timeSigConfig = {
            '4/4': { beats: 4, subs: [{v:'quarter', l:'Quarter Notes', m:1}, {v:'8th', l:'8th Notes', m:2}, {v:'12th', l:'12th Notes (Triplets)', m:3}, {v:'16th', l:'16th Notes', m:4}] },
            '3/4': { beats: 3, subs: [{v:'quarter', l:'Quarter Notes', m:1}, {v:'8th', l:'8th Notes', m:2}, {v:'12th', l:'12th Notes (Triplets)', m:3}, {v:'16th', l:'16th Notes', m:4}] },
            '2/4': { beats: 2, subs: [{v:'quarter', l:'Quarter Notes', m:1}, {v:'8th', l:'8th Notes', m:2}, {v:'12th', l:'12th Notes (Triplets)', m:3}, {v:'16th', l:'16th Notes', m:4}] },
            '6/8': { beats: 6, subs: [{v:'8th', l:'8th Notes', m:1}, {v:'16th', l:'16th Notes', m:2}] }
        };

        var symOptions = [
            { v: 'circle',      label: '●', title: 'Filled Circle' },
            { v: 'cross',       label: '✕', title: 'Cross (X)' },
            { v: 'open-circle', label: '○', title: 'Open Circle' },
            { v: 'slash',       label: '/',  title: 'Forward Slash' },
            { v: 'backslash',   label: '\\', title: 'Backslash' },
            { v: 'plus',        label: '+',  title: 'Plus' }
        ];

        function findSymIndex(symbol) {
            for (var i = 0; i < symOptions.length; i++) {
                if (symOptions[i].v === symbol) return i;
            }
            return 0;
        }


        var liveInstrumentsMemory = [
            { id: 'hihat', defaultName: 'hihat', symbol: 'cross' },
            { id: 'snare', defaultName: 'snare', symbol: 'circle' },
            { id: 'bass',  defaultName: 'bass',  symbol: 'circle' }
        ];

        var gridContainer = document.getElementById('notationGrid');
        var timeSigSelect = document.getElementById('timeSigSelect');
        var barsSelect = document.getElementById('barsSelect');
        var variantsSelect = document.getElementById('variantsSelect');
        var subdivisionSelect = document.getElementById('subdivisionSelect');
        var addTrackBtn = document.getElementById('addTrackBtn');
        var projectTitle = document.getElementById('projectTitle');
        var compositionNotes = document.getElementById('compositionNotes');
        var printQrCode = document.getElementById('printQrCode');
        var headerMenuBtn = document.getElementById('headerMenuBtn');
        var headerMenuPanel = document.getElementById('headerMenuPanel');

        var globalCachedGridTemplate = "";
        var globalCachedTotalSteps = 0;
        var beatSubOverrides = {};
        var dragSrcRow = null;
        var defaultProjectTitle = "My Drum Groove Composition";
        var maxStepsForPortraitPrint = 16;
        var portraitPrintMaxWidth = 1400;
        var msPerMinute = 60000;
        var msPerHour = 60 * msPerMinute;
        var msPerDay = 24 * msPerHour;
        var grooveIdCounter = 0;

        var undoStack = [];
        var redoStack = [];
        var maxUndoHistorySize = 50;
        var isApplyingSnapshot = false;

        function getSanitizedBarsCount() {
            var val = parseInt(barsSelect.value, 10);
            if (isNaN(val) || val < 1) return 1;
            return val;
        }

        function getSanitizedVariantsCount() {
            if (!variantsSelect) return 1;
            var val = parseInt(variantsSelect.value, 10);
            if (isNaN(val) || val < 1) return 1;
            if (val > 8) return 8;
            return val;
        }

        function getEffectiveBeatMultiplier(beatIndex, globalMultiplier) {
            var override = beatSubOverrides[beatIndex];
            return (override !== undefined) ? override : globalMultiplier;
        }

        function computeBeatMultipliersArray(beatsPerBar, globalMultiplier) {
            var arr = [];
            for (var i = 0; i < beatsPerBar; i++) {
                arr.push(getEffectiveBeatMultiplier(i, globalMultiplier));
            }
            return arr;
        }

        function computeStepsPerBarFromArray(beatMultipliers) {
            var total = 0;
            for (var i = 0; i < beatMultipliers.length; i++) total += beatMultipliers[i];
            return total;
        }

        function computeBeatStartOffset(beatMultipliers, beatIndex) {
            var offset = 0;
            for (var i = 0; i < beatIndex; i++) offset += beatMultipliers[i];
            return offset;
        }

        function remapNotesForBeatMultiplierChange(savedVariants, oldBeatMultipliers, newBeatMultipliers, totalBars) {
            var beatsPerBar = oldBeatMultipliers.length;
            var oldStepsPerBar = computeStepsPerBarFromArray(oldBeatMultipliers);
            var newStepsPerBar = computeStepsPerBarFromArray(newBeatMultipliers);
            var remapped = [];
            for (var v = 0; v < savedVariants.length; v++) {
                var newVariant = {};
                var variant = savedVariants[v];
                for (var instId in variant) {
                    if (!variant.hasOwnProperty(instId)) continue;
                    var newNotes = [];
                    var oldNotes = variant[instId];
                    for (var n = 0; n < oldNotes.length; n++) {
                        var note = oldNotes[n];
                        var stepIdx = (typeof note === 'object') ? note.i : note;
                        var stateType = (typeof note === 'object') ? note.s : 'A';
                        var bar = Math.floor(stepIdx / oldStepsPerBar);
                        if (bar >= totalBars) continue;
                        var posInBar = stepIdx - bar * oldStepsPerBar;
                        var beat = beatsPerBar - 1;
                        var beatStartOld = 0;
                        for (var bt = 0; bt < beatsPerBar; bt++) {
                            var nextStart = beatStartOld + oldBeatMultipliers[bt];
                            if (posInBar < nextStart) { beat = bt; break; }
                            beatStartOld = nextStart;
                        }
                        var subOffset = posInBar - beatStartOld;
                        if (subOffset >= newBeatMultipliers[beat]) continue;
                        var newBeatStart = computeBeatStartOffset(newBeatMultipliers, beat);
                        var newIdx = bar * newStepsPerBar + newBeatStart + subOffset;
                        var newNote = {i: newIdx, s: stateType};
                        if (typeof note === 'object' && note.a) newNote.a = 1;
                        newNotes.push(newNote);
                    }
                    newVariant[instId] = newNotes;
                }
                remapped.push(newVariant);
            }
            return remapped;
        }

        function captureSnapshot() {
            return {
                title: projectTitle.value,
                time: timeSigSelect.value,
                bars: barsSelect.value,
                variants: variantsSelect.value,
                sub: subdivisionSelect.value,
                beatSubOverrides: JSON.parse(JSON.stringify(beatSubOverrides)),
                notes: compositionNotes.value,
                instruments: liveInstrumentsMemory.map(function(inst) {
                    return { id: inst.id, defaultName: inst.defaultName, symbol: inst.symbol };
                }),
                variantNotes: extractAllVariantNotesStatic()
            };
        }

        function extractAllVariantNotesStatic() {
            var sections = document.querySelectorAll('.variant-section');
            var totalVariants = sections.length || 1;
            var savedVariants = [];
            for (var v = 0; v < totalVariants; v++) {
                savedVariants.push(extractCurrentNotes(v));
            }
            return savedVariants;
        }

        function pushUndoSnapshot() {
            if (isApplyingSnapshot) return;
            undoStack.push(captureSnapshot());
            if (undoStack.length > maxUndoHistorySize) undoStack.shift();
            redoStack = [];
        }

        function applySnapshot(snapshot) {
            isApplyingSnapshot = true;

            liveInstrumentsMemory = snapshot.instruments.map(function(inst) {
                return { id: inst.id, defaultName: inst.defaultName, symbol: inst.symbol };
            });

            projectTitle.value = snapshot.title;
            document.title = snapshot.title;
            compositionNotes.value = snapshot.notes;
            timeSigSelect.value = snapshot.time;
            barsSelect.value = snapshot.bars;
            variantsSelect.value = snapshot.variants;

            var options = timeSigConfig[snapshot.time].subs;
            subdivisionSelect.innerHTML = '';
            for (var i = 0; i < options.length; i++) {
                var opt = document.createElement('option');
                opt.value = options[i].v;
                opt.textContent = options[i].l;
                subdivisionSelect.appendChild(opt);
            }
            subdivisionSelect.value = snapshot.sub;

            beatSubOverrides = snapshot.beatSubOverrides ? JSON.parse(JSON.stringify(snapshot.beatSubOverrides)) : {};

            buildNotationGrid();
            var variantCount = parseInt(snapshot.variants, 10) || 1;
            restoreAllVariantNotes(normalizeVariantNotesList(snapshot.variantNotes, variantCount));
            updateNotesContainerClass();
            updateURL();

            isApplyingSnapshot = false;
        }

        function performUndo() {
            if (undoStack.length === 0) return;
            redoStack.push(captureSnapshot());
            applySnapshot(undoStack.pop());
        }

        function performRedo() {
            if (redoStack.length === 0) return;
            undoStack.push(captureSnapshot());
            applySnapshot(redoStack.pop());
        }

        function cloneNotesList(notesList) {
            var cloned = [];
            for (var i = 0; i < notesList.length; i++) {
                if (typeof notesList[i] !== 'object') {
                    cloned.push({i: notesList[i], s: 'A'});
                    continue;
                }
                var clonedNote = {
                    i: notesList[i].i,
                    s: notesList[i].s
                };
                if (notesList[i].a) clonedNote.a = 1;
                cloned.push(clonedNote);
            }
            return cloned;
        }

        function cloneVariantNotesMap(savedData) {
            var cloned = {};
            if (!savedData) return cloned;
            for (var instId in savedData) {
                if (savedData.hasOwnProperty(instId)) {
                    cloned[instId] = cloneNotesList(savedData[instId] || []);
                }
            }
            return cloned;
        }

        function normalizeVariantNotesList(variantNotesList, desiredCount) {
            var normalized = [];
            var sourceList = Array.isArray(variantNotesList) ? variantNotesList : [];
            var baseCount = sourceList.length;

            for (var i = 0; i < Math.min(sourceList.length, desiredCount); i++) {
                normalized.push(cloneVariantNotesMap(sourceList[i]));
            }

            while (normalized.length < desiredCount) {
                var fallback = {};
                if (baseCount > 0) {
                    var fallbackIndex = Math.min(normalized.length, baseCount - 1);
                    fallback = sourceList[fallbackIndex] || sourceList[baseCount - 1] || {};
                }
                normalized.push(cloneVariantNotesMap(fallback));
            }

            return normalized;
        }

        function buildVariantsPayload(variantNotesList) {
            var payload = [];
            for (var v = 0; v < variantNotesList.length; v++) {
                payload.push({
                    name: 'Variant ' + (v + 1),
                    tracks: liveInstrumentsMemory.map(function(inst) {
                        return {
                            id: inst.id,
                            notes: cloneNotesList((variantNotesList[v] && variantNotesList[v][inst.id]) || [])
                        };
                    })
                });
            }
            return payload;
        }

        function buildTracksPayload(savedNotes) {
            var notesByTrack = savedNotes || {};
            return liveInstrumentsMemory.map(function(inst) {
                return {
                    id: inst.id,
                    name: inst.defaultName,
                    sym: inst.symbol,
                    notes: notesByTrack[inst.id] || []
                };
            });
        }

        function updateNotesContainerClass() {
            var notesContainer = document.querySelector('.notes-container');
            if (notesContainer) {
                if (compositionNotes.value.trim().length === 0) {
                    notesContainer.classList.add('empty');
                } else {
                    notesContainer.classList.remove('empty');
                }
            }
        }

        function updateSubdivisionDropdown() {
            var sig = timeSigSelect.value;
            var options = timeSigConfig[sig].subs;
            
            subdivisionSelect.innerHTML = '';
            for (var i = 0; i < options.length; i++) {
                var opt = document.createElement('option');
                opt.value = options[i].v;
                opt.textContent = options[i].l;
                subdivisionSelect.appendChild(opt);
            }
            subdivisionSelect.value = '16th';
        }

        function setHeaderMenuOpen(isOpen) {
            headerMenuBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            headerMenuPanel.hidden = !isOpen;
        }

        function toggleHeaderMenu() {
            setHeaderMenuOpen(headerMenuPanel.hidden);
        }

        function appendCompressedTrack(data, track) {
            var symIndex = findSymIndex(track.sym);
            var notes = track.notes || [];
            var noteParts = [];
            var lastIdx = -1;

            for (var n = 0; n < notes.length; n++) {
                var note = notes[n];
                var idx = note.i;
                var offset = idx - lastIdx - 1;
                var stateMap = {'A': 0, 'R': 1, 'L': 2};
                var stateBits = stateMap[note.s] || 0;
                var accentBit = (note.a) ? 1 : 0;

                if (offset > 4095) {
                    console.warn('Note offset ' + offset + ' exceeds the 4095-step QR compression limit and will be truncated to 12 bits in compressed share links, causing data loss on decompression.');
                }

                if (offset < 32) {
                    noteParts.push((offset << 3) | (stateBits << 1) | accentBit);
                } else {
                    noteParts.push(0x80 | (offset & 0x7F));
                    var offsetHi = (offset >> 7) & 0x1F;
                    noteParts.push((offsetHi << 3) | (stateBits << 1) | accentBit);
                }
                lastIdx = idx;
            }

            if (notes.length > 31) {
                console.warn('Track has ' + notes.length + ' notes, but compression supports max 31 per track. Notes will be truncated.');
            }

            data.push((symIndex << 5) | Math.min(noteParts.length, 31));
            for (var np = 0; np < Math.min(noteParts.length, 31); np++) {
                data.push(noteParts[np] & 0xFF);
            }
        }

        function readCompressedTrack(allData, idx, inst) {
            var trackByte = allData.charCodeAt(idx++);
            var symIndex = (trackByte >> 5) & 0x7;
            var noteCount = trackByte & 0x1F;
            var decompNotes = [];
            var lastIdx = -1;
            var stateReverseMap = {0: 'A', 1: 'R', 2: 'L'};

            for (var n = 0; n < noteCount; n++) {
                var b1 = allData.charCodeAt(idx++);
                var offset, stateBits, accentBit;

                if (b1 & 0x80) {
                    var b2 = allData.charCodeAt(idx++);
                    var offsetLo = b1 & 0x7F;
                    var offsetHi = (b2 >> 3) & 0x1F;
                    offset = offsetLo | (offsetHi << 7);
                    stateBits = (b2 >> 1) & 0x3;
                    accentBit = b2 & 0x1;
                } else {
                    offset = (b1 >> 3) & 0x1F;
                    stateBits = (b1 >> 1) & 0x3;
                    accentBit = b1 & 0x1;
                }

                var noteIdx = lastIdx + offset + 1;
                var noteObj = {i: noteIdx, s: stateReverseMap[stateBits]};
                if (accentBit) noteObj.a = 1;
                decompNotes.push(noteObj);
                lastIdx = noteIdx;
            }

            var trackSym = symOptions[symIndex] ? symOptions[symIndex].v : 'circle';
            return {
                nextIdx: idx,
                track: {
                    id: inst.id,
                    name: inst.defaultName,
                    sym: trackSym,
                    notes: decompNotes
                }
            };
        }

        // Compression/decompression functions for QR code URL optimization
        var MAX_URL_LENGTH = 2000;
        function compressState(tracksPayload, timeVal, barsVal, subVal, titleVal, notesVal, variantsPayload) {
            // Bit layout (16-bit value):
            //   Bit positions 10-13: variant count - 1 (4-bit field, supports 1-16 variants)
            //   Bit 9:  hasNotes flag
            //   Bit 8:  hasTitle flag
            //   Bits 6-7: time signature (2 bits: 0=4/4, 1=3/4, 2=2/2, 3=6/8)
            //   Bits 2-5: bars count - 1 (4 bits: supports 1-16 bars)
            //   Bits 0-1: subdivision (2 bits: 0=quarter, 1=8th, 2=12th, 3=16th)
            var timeMap = {'4/4': 0, '3/4': 1, '2/2': 2, '6/8': 3};
            var subMap = {'quarter': 0, '8th': 1, '12th': 2, '16th': 3};
            var timeBits = timeMap[timeVal] || 0;
            var barsBits = (parseInt(barsVal, 10) - 1) & 0xF;
            var subBits = subMap[subVal] || 3;
            var hasTitle = (titleVal && titleVal !== defaultProjectTitle) ? 1 : 0;
            var hasNotes = (notesVal && notesVal.length > 0) ? 1 : 0;
            var variantCount = Math.max(1, Math.min((variantsPayload && variantsPayload.length) || 1, 16));
            var variantBits = (variantCount - 1) & 0xF;
            
            var metadata = (variantBits << 10) | (timeBits << 6) | (barsBits << 2) | (subBits << 0) | (hasTitle << 8) | (hasNotes << 9);
            
            // Build compressed data with proper byte order
            var data = [];
            data.push((metadata >> 8) & 0xFF);
            data.push(metadata & 0xFF);
            
            // Encode title if present (using 2-byte length to support UTF-8 without corruption)
            if (hasTitle) {
                var titleBytes = new TextEncoder().encode(titleVal);
                // Cap at 65535 bytes (2-byte length field)
                var titleLen = Math.min(titleBytes.length, 65535);
                if (titleLen < titleBytes.length) {
                    console.warn('Title truncated to 65535 bytes for compression');
                }
                data.push((titleLen >> 8) & 0xFF);
                data.push(titleLen & 0xFF);
                for (var tb = 0; tb < titleLen; tb++) {
                    data.push(titleBytes[tb]);
                }
            }
             
            // Encode notes if present
            if (hasNotes) {
                var notesBytes = new TextEncoder().encode(notesVal);
                // Cap at 65535 bytes (2-byte length field)
                var notesLen = Math.min(notesBytes.length, 65535);
                if (notesLen < notesBytes.length) {
                    console.warn('Notes truncated to 65535 bytes for compression');
                }
                data.push((notesLen >> 8) & 0xFF);
                data.push(notesLen & 0xFF);
                for (var nb = 0; nb < notesLen; nb++) {
                    data.push(notesBytes[nb]);
                }
            }
            
            data.push(tracksPayload.length);

            if (variantCount > 1) {
                for (var v = 0; v < variantCount; v++) {
                    var variantTracks = variantsPayload[v].tracks || [];
                    for (var vt = 0; vt < tracksPayload.length; vt++) {
                        var fallbackTrack = tracksPayload[vt];
                        var variantTrack = variantTracks[vt] || {id: fallbackTrack.id, notes: []};
                        appendCompressedTrack(data, {
                            id: fallbackTrack.id,
                            sym: fallbackTrack.sym,
                            notes: variantTrack.notes || []
                        });
                    }
                }
            } else {
                for (var t = 0; t < tracksPayload.length; t++) {
                    appendCompressedTrack(data, tracksPayload[t]);
                }
            }
            
            // Convert data array to binary string and encode as base64
            var binaryString = '';
            for (var i = 0; i < data.length; i++) {
                binaryString += String.fromCharCode(data[i]);
            }
            return btoa(binaryString);
        }

        function decompressState(compressed) {
            try {
                var allData = atob(compressed);
                var idx = 0;
                
                // Decode metadata (2 bytes)
                // Bit layout: bits 13-10 (variant count), bit 9 (hasNotes), bit 8 (hasTitle), bits 6-7 (time), bits 2-5 (bars), bits 0-1 (sub)
                var metadata = (allData.charCodeAt(idx++) << 8) | allData.charCodeAt(idx++);
                var variantCount = ((metadata >> 10) & 0xF) + 1;
                var timeBits = (metadata >> 6) & 0x3;
                var barsBits = (metadata >> 2) & 0xF;
                var subBits = (metadata >> 0) & 0x3;
                var hasTitle = (metadata >> 8) & 0x1;
                var hasNotes = (metadata >> 9) & 0x1;
                
                var timeReverseMap = {0: '4/4', 1: '3/4', 2: '2/2', 3: '6/8'};
                var subReverseMap = {0: 'quarter', 1: '8th', 2: '12th', 3: '16th'};
                
                var timeVal = timeReverseMap[timeBits];
                var barsVal = String(barsBits + 1);
                var subVal = subReverseMap[subBits];
                var titleVal = defaultProjectTitle;
                var notesVal = '';
                
                // Decode title if present (now using 2-byte length field)
                if (hasTitle) {
                    var titleLen = (allData.charCodeAt(idx++) << 8) | allData.charCodeAt(idx++);
                    var titleBytes = [];
                    for (var i = 0; i < titleLen; i++) {
                        titleBytes.push(allData.charCodeAt(idx++));
                    }
                    titleVal = new TextDecoder().decode(new Uint8Array(titleBytes));
                }
                
                // Decode notes if present
                if (hasNotes) {
                    var notesLen = (allData.charCodeAt(idx++) << 8) | allData.charCodeAt(idx++);
                    var notesBytes = [];
                    for (var i = 0; i < notesLen; i++) {
                        notesBytes.push(allData.charCodeAt(idx++));
                    }
                    notesVal = new TextDecoder().decode(new Uint8Array(notesBytes));
                }
                
                // Decode track count
                var trackCount = allData.charCodeAt(idx++);
                
                // Validate track count doesn't exceed available instruments
                if (trackCount > liveInstrumentsMemory.length) {
                    console.warn('Compressed data contains ' + trackCount + ' tracks, but only ' + liveInstrumentsMemory.length + ' instruments available. Extra tracks will be dropped.');
                }
                
                // Decode tracks
                var decompTracks = [];
                var decompVariants = [];

                if (variantCount > 1) {
                    for (var v = 0; v < variantCount; v++) {
                        var decompVariantTracks = [];
                        for (var t = 0; t < trackCount && t < liveInstrumentsMemory.length; t++) {
                            var inst = liveInstrumentsMemory[t];
                            var trackData = readCompressedTrack(allData, idx, inst);
                            idx = trackData.nextIdx;
                            decompVariantTracks.push(trackData.track);
                        }
                        decompVariants.push({
                            name: 'Variant ' + (v + 1),
                            tracks: decompVariantTracks
                        });
                    }
                } else {
                    for (var t = 0; t < trackCount && t < liveInstrumentsMemory.length; t++) {
                        var inst = liveInstrumentsMemory[t];
                        var trackData = readCompressedTrack(allData, idx, inst);
                        idx = trackData.nextIdx;
                        decompTracks.push(trackData.track);
                    }
                }
                
                return {
                    time: timeVal,
                    bars: barsVal,
                    sub: subVal,
                    title: titleVal,
                    notes: notesVal,
                    tracks: decompTracks,
                    variants: decompVariants
                };
            } catch (e) {
                console.error("Failed to decompress state", e);
                return null;
            }
        }

        // Helper function to construct base URL
        function buildBaseUrl() {
            return window.location.protocol + "//" + window.location.host + window.location.pathname;
        }

        // Encodes the dynamic session schema directly into standard URL search parameters
        function updateURL() {
            var titleVal = projectTitle.value;
            var timeVal = timeSigSelect.value;
            var barsVal = barsSelect.value;
            var variantCount = getSanitizedVariantsCount();
            var subVal = subdivisionSelect.value;
            var notesVal = compositionNotes.value;
            
            var savedVariants = normalizeVariantNotesList(extractAllVariantNotes(), variantCount);
            var savedNotes = savedVariants[0] || {};
            var tracksPayload = buildTracksPayload(savedNotes);
            var variantsPayload = variantCount > 1 ? buildVariantsPayload(savedVariants) : null;

            var params = new URLSearchParams();
            params.set('title', titleVal);
            params.set('time', timeVal);
            params.set('bars', barsVal);
            params.set('sub', subVal);
            params.set('notes', notesVal);
            params.set('tracks', JSON.stringify(tracksPayload));
            if (variantCount > 1) {
                params.set('variants', JSON.stringify(variantsPayload));
            }
            var hasBeatSubOverrides = Object.keys(beatSubOverrides).length > 0;
            if (hasBeatSubOverrides) {
                params.set('beatSubs', JSON.stringify(beatSubOverrides));
            }

            var newUrl = buildBaseUrl() + '?' + params.toString();

            // Fall back to the compressed format when the URL exceeds the practical URI limit.
            // Skip compression when beat-level subdivision overrides are active (not encoded in compressed format).
            // The compressed value is also reused for the QR code below to avoid compressing twice.
            var compressed = null;
            if (!hasBeatSubOverrides && newUrl.length > MAX_URL_LENGTH) {
                compressed = compressState(tracksPayload, timeVal, barsVal, subVal, titleVal, notesVal, variantsPayload);
                var compressedParams = new URLSearchParams();
                compressedParams.set('c', compressed);
                newUrl = buildBaseUrl() + '?' + compressedParams.toString();
            }

            window.history.replaceState({ path: newUrl }, '', newUrl);

            // Generate compressed URL for QR code (use full URL when beat sub overrides are active)
            // Suppress QR when the beat-override URL exceeds safe QR data capacity for 90×90 px print output.
            var maxQrUrlLength = 300;
            if (printQrCode) {
                var qrUrl;
                if (hasBeatSubOverrides) {
                    if (newUrl.length > maxQrUrlLength) {
                        printQrCode.src = '';
                    } else {
                        qrUrl = newUrl;
                        printQrCode.src = "https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=" + encodeURIComponent(qrUrl);
                    }
                } else {
                    if (!compressed) {
                        compressed = compressState(tracksPayload, timeVal, barsVal, subVal, titleVal, notesVal, variantsPayload);
                    }
                    var qrParams = new URLSearchParams();
                    qrParams.set('c', compressed);
                    qrUrl = buildBaseUrl() + '?' + qrParams.toString();
                    printQrCode.src = "https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=" + encodeURIComponent(qrUrl);
                }
            }
        }

        // Extracts all structural active marks from DOM rows, saving index + short state keys
        function extractCurrentNotes(variantIndex) {
            var savedData = {};
            var rows = document.querySelectorAll('.track-row[data-variant="' + variantIndex + '"]');
            for (var r = 0; r < rows.length; r++) {
                var row = rows[r];
                var instId = row.getAttribute('data-instrument');
                var steps = row.querySelectorAll('.step');
                var activeNotes = [];
                for (var s = 0; s < steps.length; s++) {
                    var step = steps[s];
                    var stepIdx = parseInt(step.getAttribute('data-step'), 10);
                    var isAccented = step.classList.contains('accent');
                    if (step.classList.contains('active')) {
                        var noteObj = {i: stepIdx, s: 'A'};
                        if (isAccented) noteObj.a = 1;
                        activeNotes.push(noteObj);
                    } else if (step.classList.contains('hand-R')) {
                        var noteObj = {i: stepIdx, s: 'R'};
                        if (isAccented) noteObj.a = 1;
                        activeNotes.push(noteObj);
                    } else if (step.classList.contains('hand-L')) {
                        var noteObj = {i: stepIdx, s: 'L'};
                        if (isAccented) noteObj.a = 1;
                        activeNotes.push(noteObj);
                    }
                }
                savedData[instId] = activeNotes;
            }
            return savedData;
        }

        function extractAllVariantNotes() {
            var sections = document.querySelectorAll('.variant-section');
            var totalVariants = sections.length || 1;
            var savedVariants = [];
            for (var v = 0; v < totalVariants; v++) {
                savedVariants.push(extractCurrentNotes(v));
            }
            return savedVariants;
        }

        // Restores calculated active state tokens, preserving total historical link compatibility
        function restoreNotes(savedData, variantIndex) {
            var rows = document.querySelectorAll('.track-row[data-variant="' + variantIndex + '"]');
            for (var r = 0; r < rows.length; r++) {
                var row = rows[r];
                var instId = row.getAttribute('data-instrument');
                if (savedData[instId]) {
                    var activeNotes = savedData[instId];
                    for (var a = 0; a < activeNotes.length; a++) {
                        var note = activeNotes[a];
                        
                        // Smart Capture: Supports legacy straight integer index arrays from older versions
                        var stepIdx = (typeof note === 'object') ? note.i : note;
                        var stateType = (typeof note === 'object') ? note.s : 'A';
                        
                        var step = row.querySelector('[data-step="' + stepIdx + '"]');
                        if (step) {
                            if (stateType === 'A') step.classList.add('active');
                            else if (stateType === 'R') step.classList.add('hand-R');
                            else if (stateType === 'L') step.classList.add('hand-L');
                            if (typeof note === 'object' && note.a) step.classList.add('accent');
                        }
                    }
                }
            }
        }

        function restoreAllVariantNotes(variantNotesList) {
            for (var v = 0; v < variantNotesList.length; v++) {
                restoreNotes(variantNotesList[v], v);
            }
        }

        function executeBarCopy(fromBarIdx, toBarIdx) {
            if (fromBarIdx === toBarIdx) return; 
            pushUndoSnapshot();

            var sig = timeSigSelect.value;
            var subVal = subdivisionSelect.value;
            var currentSigConfig = timeSigConfig[sig];
            var currentSub = currentSigConfig.subs.find(function(s) { return s.v === subVal; }) || currentSigConfig.subs[0];
            var beatMultipliers = computeBeatMultipliersArray(currentSigConfig.beats, currentSub.m);
            var stepsPerBar = computeStepsPerBarFromArray(beatMultipliers);
            var sourceOffset = fromBarIdx * stepsPerBar;
            var targetOffset = toBarIdx * stepsPerBar;

            var allVisibleRows = document.querySelectorAll('.track-row:not(.header-row)');
            for (var r = 0; r < allVisibleRows.length; r++) {
                var currentRow = allVisibleRows[r];
                for (var i = 0; i < stepsPerBar; i++) {
                    var sourceBox = currentRow.querySelector('[data-step="' + (sourceOffset + i) + '"]');
                    var targetBox = currentRow.querySelector('[data-step="' + (targetOffset + i) + '"]');
                    
                    if (sourceBox && targetBox) {
                        // Reset target states completely before cloning values
                        targetBox.classList.remove('active', 'hand-R', 'hand-L', 'accent');
                        
                        if (sourceBox.classList.contains('active')) {
                            targetBox.classList.add('active');
                        } else if (sourceBox.classList.contains('hand-R')) {
                            targetBox.classList.add('hand-R');
                        } else if (sourceBox.classList.contains('hand-L')) {
                            targetBox.classList.add('hand-L');
                        }
                        if (sourceBox.classList.contains('accent')) {
                            targetBox.classList.add('accent');
                        }
                    }
                }
            }
            updateURL();
        }

        function executeBarDeletion(targetBarIdx) {
            var currentBars = getSanitizedBarsCount();
            if (currentBars <= 1) return; 
            pushUndoSnapshot();

            var sig = timeSigSelect.value;
            var subVal = subdivisionSelect.value;
            var currentSigConfig = timeSigConfig[sig];
            var currentSub = currentSigConfig.subs.find(function(s) { return s.v === subVal; }) || currentSigConfig.subs[0];
            var beatMultipliers = computeBeatMultipliersArray(currentSigConfig.beats, currentSub.m);
            var stepsPerBar = computeStepsPerBarFromArray(beatMultipliers);

            var startDelIdx = targetBarIdx * stepsPerBar;
            var endDelIdx = startDelIdx + stepsPerBar;

            var savedVariants = extractAllVariantNotes();
            var newVariants = [];

            for (var v = 0; v < savedVariants.length; v++) {
                var savedNotes = savedVariants[v];
                var newNotes = {};

                for (var instId in savedNotes) {
                    if (savedNotes.hasOwnProperty(instId)) {
                        var oldNotes = savedNotes[instId];
                        var newNotesList = [];

                        for (var i = 0; i < oldNotes.length; i++) {
                            var note = oldNotes[i];
                            if (note.i >= startDelIdx && note.i < endDelIdx) {
                                continue; 
                            } else if (note.i >= endDelIdx) {
                                newNotesList.push({i: note.i - stepsPerBar, s: note.s, a: note.a}); 
                            } else {
                                newNotesList.push({i: note.i, s: note.s, a: note.a}); 
                            }
                        }
                        newNotes[instId] = newNotesList;
                    }
                }
                newVariants.push(newNotes);
            }

            barsSelect.value = currentBars - 1;
            buildNotationGrid();
            restoreAllVariantNotes(newVariants);
            updateURL();
        }

        function executeOuterBarAddition(type) {
            var currentBars = getSanitizedBarsCount();
            if (currentBars >= 16) return; 
            pushUndoSnapshot();

            var sig = timeSigSelect.value;
            var subVal = subdivisionSelect.value;
            var currentSigConfig = timeSigConfig[sig];
            var currentSub = currentSigConfig.subs.find(function(s) { return s.v === subVal; }) || currentSigConfig.subs[0];
            var beatMultipliers = computeBeatMultipliersArray(currentSigConfig.beats, currentSub.m);
            var stepsPerBar = computeStepsPerBarFromArray(beatMultipliers);

            var savedVariants = extractAllVariantNotes();
            var newVariants = [];

            for (var v = 0; v < savedVariants.length; v++) {
                var savedNotes = savedVariants[v];
                var newNotes = {};

                for (var instId in savedNotes) {
                    if (savedNotes.hasOwnProperty(instId)) {
                        var oldNotes = savedNotes[instId];
                        var newNotesList = [];

                        if (type === 'start') {
                            for (var i = 0; i < oldNotes.length; i++) {
                                var note = oldNotes[i];
                                newNotesList.push({i: note.i + stepsPerBar, s: note.s, a: note.a}); 
                                if (note.i < stepsPerBar) {
                                    newNotesList.push({i: note.i, s: note.s, a: note.a}); 
                                }
                            }
                        } else if (type === 'end') {
                            var lastBarStartIdx = (currentBars - 1) * stepsPerBar;
                            for (var i = 0; i < oldNotes.length; i++) {
                                var note = oldNotes[i];
                                newNotesList.push({i: note.i, s: note.s, a: note.a}); 
                                if (note.i >= lastBarStartIdx) {
                                    newNotesList.push({i: note.i + stepsPerBar, s: note.s, a: note.a}); 
                                }
                            }
                        }
                        newNotes[instId] = newNotesList;
                    }
                }
                newVariants.push(newNotes);
            }

            barsSelect.value = currentBars + 1;
            buildNotationGrid();
            restoreAllVariantNotes(newVariants);
            updateURL();
        }

        function generateContextualCopyMenu(containerElement, leftIndex, rightIndex) {
            var menu = document.createElement('div');
            menu.classList.add('bar-copy-menu');
            
            var totalBars = getSanitizedBarsCount();

            var btnCopyLeft = document.createElement('button');
            btnCopyLeft.className = 'bar-copy-inline-btn';
            btnCopyLeft.innerHTML = '◂ Copy Left';
            btnCopyLeft.title = 'Copy Bar ' + (rightIndex + 1) + ' into Bar ' + (leftIndex + 1);
            btnCopyLeft.onclick = function(e) {
                e.stopPropagation();
                executeBarCopy(rightIndex, leftIndex); 
            };
            menu.appendChild(btnCopyLeft);

            if (totalBars > 1) {
                var btnDelLeft = document.createElement('button');
                btnDelLeft.className = 'bar-copy-inline-btn del-btn';
                btnDelLeft.innerHTML = 'Del Left ✖';
                btnDelLeft.title = 'Delete Bar ' + (leftIndex + 1);
                btnDelLeft.onclick = function(e) {
                    e.stopPropagation();
                    executeBarDeletion(leftIndex);
                };
                menu.appendChild(btnDelLeft);

                var btnDelRight = document.createElement('button');
                btnDelRight.className = 'bar-copy-inline-btn del-btn';
                btnDelRight.innerHTML = '✖ Del Right';
                btnDelRight.title = 'Delete Bar ' + (rightIndex + 1);
                btnDelRight.onclick = function(e) {
                    e.stopPropagation();
                    executeBarDeletion(rightIndex);
                };
                menu.appendChild(btnDelRight);
            }

            var btnCopyRight = document.createElement('button');
            btnCopyRight.className = 'bar-copy-inline-btn';
            btnCopyRight.innerHTML = 'Copy Right ▸';
            btnCopyRight.title = 'Copy Bar ' + (leftIndex + 1) + ' into Bar ' + (rightIndex + 1);
            btnCopyRight.onclick = function(e) {
                e.stopPropagation();
                executeBarCopy(leftIndex, rightIndex); 
            };
            menu.appendChild(btnCopyRight);

            containerElement.appendChild(menu);
        }

        function generateOuterBoundaryMenu(containerElement, type) {
            var menu = document.createElement('div');
            menu.classList.add('bar-copy-menu');
            
            var totalBars = getSanitizedBarsCount();

            if (type === 'start') {
                var btnLeft = document.createElement('button');
                btnLeft.className = 'bar-copy-inline-btn';
                btnLeft.innerHTML = '◂ Copy Left';
                btnLeft.title = 'Create new front bar from first bar content';
                btnLeft.onclick = function(e) {
                    e.stopPropagation();
                    executeOuterBarAddition('start');
                };
                menu.appendChild(btnLeft);

                if (totalBars > 1) {
                    var btnDelRight = document.createElement('button');
                    btnDelRight.className = 'bar-copy-inline-btn del-btn';
                    btnDelRight.innerHTML = '✖ Del Right';
                    btnDelRight.title = 'Delete the first bar';
                    btnDelRight.onclick = function(e) {
                        e.stopPropagation();
                        executeBarDeletion(0);
                    };
                    menu.appendChild(btnDelRight);
                }
            } else if (type === 'end') {
                if (totalBars > 1) {
                    var btnDelLeft = document.createElement('button');
                    btnDelLeft.className = 'bar-copy-inline-btn del-btn';
                    btnDelLeft.innerHTML = 'Del Left ✖';
                    btnDelLeft.title = 'Delete the last bar';
                    btnDelLeft.onclick = function(e) {
                        e.stopPropagation();
                        executeBarDeletion(totalBars - 1);
                    };
                    menu.appendChild(btnDelLeft);
                }

                var btnRight = document.createElement('button');
                btnRight.className = 'bar-copy-inline-btn';
                btnRight.innerHTML = 'Copy Right ▸';
                btnRight.title = 'Create new end bar from last bar content';
                btnRight.onclick = function(e) {
                    e.stopPropagation();
                    executeOuterBarAddition('end');
                };
                menu.appendChild(btnRight);
            }

            containerElement.appendChild(menu);
        }

        function getSubLabels(beatMult, sig) {
            if (sig !== '6/8') {
                if (beatMult === 2) return ['', '&'];
                if (beatMult === 3) return ['', 'la', 'li'];
                if (beatMult === 4) return ['', 'e', '&', 'a'];
            } else {
                if (beatMult === 2) return ['', '&'];
            }
            return [''];
        }

        function applyBeatSubOverrideChange(beatIndex, newOverrideMult) {
            var sig = timeSigSelect.value;
            var currentSigConfig = timeSigConfig[sig];
            var currentSub = currentSigConfig.subs.find(function(s) { return s.v === subdivisionSelect.value; }) || currentSigConfig.subs[0];
            var globalMult = currentSub.m;
            var beatsPerBar = currentSigConfig.beats;

            var savedVariants = extractAllVariantNotes();
            var oldBeatMultipliers = computeBeatMultipliersArray(beatsPerBar, globalMult);

            if (newOverrideMult === null || newOverrideMult === globalMult) {
                delete beatSubOverrides[beatIndex];
            } else {
                beatSubOverrides[beatIndex] = newOverrideMult;
            }

            var newBeatMultipliers = computeBeatMultipliersArray(beatsPerBar, globalMult);
            var remappedVariants = remapNotesForBeatMultiplierChange(
                savedVariants, oldBeatMultipliers, newBeatMultipliers, getSanitizedBarsCount()
            );

            buildNotationGrid();
            restoreAllVariantNotes(normalizeVariantNotesList(remappedVariants, getSanitizedVariantsCount()));
            updateURL();
        }

        function generateBeatSubMenu(containerElement, beatIndex, sig) {
            var menu = document.createElement('div');
            menu.classList.add('beat-sub-menu');

            var subVal = subdivisionSelect.value;
            var currentSigConfig = timeSigConfig[sig];
            var globalSub = currentSigConfig.subs.find(function(s) { return s.v === subVal; }) || currentSigConfig.subs[0];
            var globalMult = globalSub.m;
            var currentOverride = beatSubOverrides[beatIndex];
            var currentMult = (currentOverride !== undefined) ? currentOverride : globalMult;

            var title = document.createElement('div');
            title.classList.add('beat-sub-menu-title');
            title.textContent = 'Beat ' + (beatIndex + 1) + ' subdivisions';
            menu.appendChild(title);

            var btnRow = document.createElement('div');
            btnRow.classList.add('beat-sub-menu-btns');

            var availableSubs = currentSigConfig.subs;
            for (var i = 0; i < availableSubs.length; i++) {
                (function(sub) {
                    var btn = document.createElement('button');
                    btn.className = 'beat-sub-btn' + (sub.m === currentMult ? ' active' : '');
                    btn.textContent = sub.l.replace(' Notes', '').replace(' (Triplets)', '');
                    btn.title = sub.l;
                    btn.onclick = function(e) {
                        e.stopPropagation();
                        var effectiveMult = beatSubOverrides[beatIndex] !== undefined ? beatSubOverrides[beatIndex] : globalMult;
                        if (sub.m === effectiveMult) return;
                        pushUndoSnapshot();
                        applyBeatSubOverrideChange(beatIndex, sub.m);
                    };
                    btnRow.appendChild(btn);
                })(availableSubs[i]);
            }

            if (currentOverride !== undefined) {
                var resetBtn = document.createElement('button');
                resetBtn.className = 'beat-sub-btn beat-sub-reset-btn';
                resetBtn.textContent = 'Reset';
                resetBtn.title = 'Reset to global subdivision';
                resetBtn.onclick = function(e) {
                    e.stopPropagation();
                    pushUndoSnapshot();
                    applyBeatSubOverrideChange(beatIndex, null);
                };
                btnRow.appendChild(resetBtn);
            }

            menu.appendChild(btnRow);
            containerElement.appendChild(menu);
        }

        function buildGridHeaderElement(totalBars, beatsPerBar, beatMultipliers, gridStyleString, sig) {
            var headerRow = document.createElement('div');
            headerRow.classList.add('track-row', 'header-row');

            var labelSpacer = document.createElement('div');
            labelSpacer.classList.add('label-ctrls', 'header-label-spacer');
            labelSpacer.textContent = "Track / Beat";
            headerRow.appendChild(labelSpacer);

            var stepsContainer = document.createElement('div');
            stepsContainer.classList.add('grid-steps');
            stepsContainer.style.gridTemplateColumns = gridStyleString;

            var startBoundaryGap = document.createElement('div');
            startBoundaryGap.classList.add('gap-bar-line');
            generateOuterBoundaryMenu(startBoundaryGap, 'start');
            stepsContainer.appendChild(startBoundaryGap);

            for (var b = 0; b < totalBars; b++) {
                if (b > 0) {
                    var barGap = document.createElement('div');
                    barGap.classList.add('gap-bar-line');
                    generateContextualCopyMenu(barGap, b - 1, b);
                    stepsContainer.appendChild(barGap);
                }
                for (var bt = 0; bt < beatsPerBar; bt++) {
                    if (bt > 0) {
                        var beatGap = document.createElement('div');
                        beatGap.classList.add('gap-beat-space');
                        stepsContainer.appendChild(beatGap);
                    }
                    var beatMult = beatMultipliers[bt];
                    var subLabels = getSubLabels(beatMult, sig);
                    for (var s = 0; s < beatMult; s++) {
                        var countCell = document.createElement('div');
                        countCell.classList.add('header-count-cell');
                        
                        if (s === 0) {
                            var hasOverride = beatSubOverrides[bt] !== undefined;
                            countCell.classList.add('beat-number-cell');
                            if (hasOverride) countCell.classList.add('beat-override-active');
                            countCell.setAttribute('data-beat-index', bt);
                            (function(beatIndex) {
                                generateBeatSubMenu(countCell, beatIndex, sig);
                            })(bt);
                            var beatLabel = document.createElement('span');
                            beatLabel.textContent = (bt + 1);
                            countCell.appendChild(beatLabel);
                        } else {
                            countCell.textContent = subLabels[s] || '';
                            countCell.style.opacity = '0.4';
                            countCell.style.fontSize = '11px';
                        }
                        stepsContainer.appendChild(countCell);
                    }
                }
            }

            var endBoundaryGap = document.createElement('div');
            endBoundaryGap.classList.add('gap-bar-line');
            generateOuterBoundaryMenu(endBoundaryGap, 'end');
            stepsContainer.appendChild(endBoundaryGap);

            headerRow.appendChild(stepsContainer);
            gridContainer.appendChild(headerRow);
        }

        function createVariantSection(variantIndex) {
            var variantSection = document.createElement('section');
            variantSection.classList.add('variant-section');
            variantSection.setAttribute('data-variant', variantIndex);

            var heading = document.createElement('div');
            heading.classList.add('variant-heading');
            heading.textContent = 'Variant ' + (variantIndex + 1);
            variantSection.appendChild(heading);

            gridContainer.appendChild(variantSection);
            return variantSection;
        }

        function moveInstrumentToIndex(instId, targetInstId, insertAbove) {
            var sourceIndex = -1;
            var targetIndex = -1;

            for (var i = 0; i < liveInstrumentsMemory.length; i++) {
                if (liveInstrumentsMemory[i].id === instId) sourceIndex = i;
                if (liveInstrumentsMemory[i].id === targetInstId) targetIndex = i;
            }

            if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
                var missingParts = [];
                if (sourceIndex === -1) missingParts.push('source=' + instId);
                if (targetIndex === -1) missingParts.push('target=' + targetInstId);
                console.warn('Unable to reorder track because ' + (missingParts.length ? missingParts.join(', ') : 'the source and target are identical') + '.');
                return;
            }

            var moved = liveInstrumentsMemory.splice(sourceIndex, 1)[0];
            if (sourceIndex < targetIndex) targetIndex--;
            if (!insertAbove) targetIndex++;
            if (targetIndex < 0) targetIndex = 0;
            if (targetIndex > liveInstrumentsMemory.length) targetIndex = liveInstrumentsMemory.length;
            liveInstrumentsMemory.splice(targetIndex, 0, moved);
        }

        function appendSingleRowElement(inst, totalBars, beatsPerBar, beatMultipliers, gridStyleString, variantIndex, variantSection) {
            var row = document.createElement('div');
            row.classList.add('track-row', 'sym-' + inst.symbol);
            row.setAttribute('data-instrument', inst.id);
            row.setAttribute('data-variant', variantIndex);

            var labelCtrls = document.createElement('div');
            labelCtrls.classList.add('label-ctrls');

            var dragHandle = document.createElement('div');
            dragHandle.classList.add('drag-handle');
            dragHandle.setAttribute('draggable', 'true');
            dragHandle.title = 'Drag to reorder';
            dragHandle.setAttribute('aria-label', 'Drag to reorder track');
            dragHandle.innerHTML = '&#10303;'; // ⠿ braille grip icon
            labelCtrls.appendChild(dragHandle);

           var curSymOpt = symOptions[findSymIndex(inst.symbol)];

            var symBtn = document.createElement('button');
            symBtn.classList.add('symbol-cycle-btn');
            symBtn.textContent = curSymOpt.label;
            symBtn.title = curSymOpt.title + ' — click to cycle symbol';

            symBtn.onclick = function(e) {
                e.stopPropagation();
                pushUndoSnapshot();
                var oldSymbol = inst.symbol;
                var nextIdx = (findSymIndex(inst.symbol) + 1) % symOptions.length;
                inst.symbol = symOptions[nextIdx].v;
                var peerRows = document.querySelectorAll('.track-row[data-instrument="' + inst.id + '"]');
                for (var p = 0; p < peerRows.length; p++) {
                    peerRows[p].classList.remove('sym-' + oldSymbol);
                    peerRows[p].classList.add('sym-' + inst.symbol);
                    var peerBtn = peerRows[p].querySelector('.symbol-cycle-btn');
                    if (peerBtn) {
                        peerBtn.textContent = symOptions[nextIdx].label;
                        peerBtn.title = symOptions[nextIdx].title + ' — click to cycle symbol';
                    }
                }
                updateURL();
            };
            labelCtrls.appendChild(symBtn);

            var input = document.createElement('input');
            input.type = 'text';
            input.classList.add('instrument-label-input');
            input.value = inst.defaultName;
            input.oninput = function() {
                pushUndoSnapshot();
                inst.defaultName = this.value;
                var peerInputs = document.querySelectorAll('.track-row[data-instrument="' + inst.id + '"] .instrument-label-input');
                for (var p = 0; p < peerInputs.length; p++) {
                    if (peerInputs[p] !== this) {
                        peerInputs[p].value = inst.defaultName;
                    }
                }
                updateURL();
            };
            labelCtrls.appendChild(input);

            var delBtn = document.createElement('button');
            delBtn.classList.add('delete-track-btn');
            delBtn.innerHTML = '&times;';
            delBtn.title = "Delete Track";
            delBtn.onclick = function() {
                pushUndoSnapshot();
                for (var m = 0; m < liveInstrumentsMemory.length; m++) {
                    if (liveInstrumentsMemory[m].id === inst.id) {
                        liveInstrumentsMemory.splice(m, 1);
                        break;
                    }
                }
                handleConfigurationLifecycle(false);
                updateURL();
            };
            labelCtrls.appendChild(delBtn);

            // --- Drag-to-reorder wiring ---
            dragHandle.ondragstart = function(e) {
                dragSrcRow = row;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', inst.id);
                // Use the full row as the drag ghost image
                var rowRect = row.getBoundingClientRect();
                e.dataTransfer.setDragImage(row, e.clientX - rowRect.left, e.clientY - rowRect.top);
                // Defer class addition so the ghost captures the un-faded state
                requestAnimationFrame(function() { row.classList.add('dragging'); });
            };

            dragHandle.ondragend = function() {
                row.classList.remove('dragging');
                dragSrcRow = null;
                var allRows = gridContainer.querySelectorAll('.track-row:not(.header-row)');
                for (var i = 0; i < allRows.length; i++) {
                    allRows[i].classList.remove('drag-over-above', 'drag-over-below');
                }
            };

            row.ondragover = function(e) {
                if (!dragSrcRow || dragSrcRow === row) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                var rect = row.getBoundingClientRect();
                row.classList.remove('drag-over-above', 'drag-over-below');
                if (e.clientY < rect.top + rect.height / 2) {
                    row.classList.add('drag-over-above');
                } else {
                    row.classList.add('drag-over-below');
                }
            };

            row.ondragleave = function(e) {
                // Guard against child-element transitions and null relatedTarget
                // (null occurs when leaving to browser chrome, viewport edge, or non-DOM regions)
                if (!e.relatedTarget || row.contains(e.relatedTarget)) return;
                row.classList.remove('drag-over-above', 'drag-over-below');
            };

            row.ondrop = function(e) {
                if (!dragSrcRow || dragSrcRow === row) return;
                e.preventDefault();
                pushUndoSnapshot();
                var insertAbove = row.classList.contains('drag-over-above');
                row.classList.remove('drag-over-above', 'drag-over-below');
                moveInstrumentToIndex(
                    dragSrcRow.getAttribute('data-instrument'),
                    row.getAttribute('data-instrument'),
                    insertAbove
                );
                handleConfigurationLifecycle(false);
                updateURL();
            };
            // --- End drag-to-reorder wiring ---

            row.appendChild(labelCtrls);

            var stepsContainer = document.createElement('div');
            stepsContainer.classList.add('grid-steps');
            stepsContainer.style.gridTemplateColumns = gridStyleString;

            var startBoundaryGap = document.createElement('div');
            startBoundaryGap.classList.add('gap-bar-line');
            generateOuterBoundaryMenu(startBoundaryGap, 'start');
            stepsContainer.appendChild(startBoundaryGap);

            var globalStepIndex = 0;
            for (var b = 0; b < totalBars; b++) {
                if (b > 0) {
                    var barGap = document.createElement('div');
                    barGap.classList.add('gap-bar-line');
                    generateContextualCopyMenu(barGap, b - 1, b);
                    stepsContainer.appendChild(barGap);
                }
                for (var bt = 0; bt < beatsPerBar; bt++) {
                    if (bt > 0) {
                        var beatGap = document.createElement('div');
                        beatGap.classList.add('gap-beat-space');
                        stepsContainer.appendChild(beatGap);
                    }
                    for (var s = 0; s < beatMultipliers[bt]; s++) {
                        var step = document.createElement('div');
                        step.classList.add('step');
                        step.setAttribute('data-step', globalStepIndex);

                        // State-Machine Engine: Cycles cleanly across 4 logical click vectors.
                        // Tapping the top 30% of an active cell toggles the accent mark (mobile-friendly
                        // alternative to right-click for touch devices that lack a secondary tap).
                        step.onclick = function(e) {
                            pushUndoSnapshot();
                            var isTopZone = (e.offsetY / this.offsetHeight) < 0.30;
                            var hasSymbol = this.classList.contains('active') || this.classList.contains('hand-R') || this.classList.contains('hand-L');
                            if (isTopZone && hasSymbol) {
                                this.classList.toggle('accent');
                            } else if (this.classList.contains('active')) {
                                this.classList.remove('active');
                                this.classList.add('hand-R');
                            } else if (this.classList.contains('hand-R')) {
                                this.classList.remove('hand-R');
                                this.classList.add('hand-L');
                            } else if (this.classList.contains('hand-L')) {
                                this.classList.remove('hand-L', 'accent');
                            } else {
                                this.classList.add('active');
                            }
                            updateURL();
                        };

                        // Accent Toggle: Right-click adds/removes accent mark on active notes (desktop)
                        step.oncontextmenu = function(e) {
                            e.preventDefault();
                            if (this.classList.contains('active') || this.classList.contains('hand-R') || this.classList.contains('hand-L')) {
                                pushUndoSnapshot();
                                this.classList.toggle('accent');
                                updateURL();
                            }
                        };

                        stepsContainer.appendChild(step);
                        globalStepIndex++;
                    }
                }
            }

            var endBoundaryGap = document.createElement('div');
            endBoundaryGap.classList.add('gap-bar-line');
            generateOuterBoundaryMenu(endBoundaryGap, 'end');
            stepsContainer.appendChild(endBoundaryGap);

            row.appendChild(stepsContainer);
            variantSection.appendChild(row);
        }

        function buildNotationGrid() {
            gridContainer.innerHTML = '';

            var sig = timeSigSelect.value;
            var subVal = subdivisionSelect.value;
            var totalBars = getSanitizedBarsCount();
            var totalVariants = getSanitizedVariantsCount();
            var currentSigConfig = timeSigConfig[sig];
            
            var beatsPerBar = currentSigConfig.beats;
            var currentSub = null;
            for (var s = 0; s < currentSigConfig.subs.length; s++) {
                if (currentSigConfig.subs[s].v === subVal) {
                    currentSub = currentSigConfig.subs[s];
                }
            }
            if (!currentSub) currentSub = currentSigConfig.subs[0];

            var multiplier = currentSub.m;
            var beatMultipliers = computeBeatMultipliersArray(beatsPerBar, multiplier);
            var stepsPerBar = computeStepsPerBarFromArray(beatMultipliers);
            globalCachedTotalSteps = stepsPerBar * totalBars; 

            var trackColumnsTemplate = [];
            trackColumnsTemplate.push('36px'); 
            
            for (var b = 0; b < totalBars; b++) {
                if (b > 0) trackColumnsTemplate.push('36px');
                for (var bt = 0; bt < beatsPerBar; bt++) {
                    if (bt > 0) trackColumnsTemplate.push('20px');
                    for (var s = 0; s < beatMultipliers[bt]; s++) {
                        trackColumnsTemplate.push('minmax(0, 1fr)');
                    }
                }
            }
            
            trackColumnsTemplate.push('36px'); 
            globalCachedGridTemplate = trackColumnsTemplate.join(' ');

            buildGridHeaderElement(totalBars, beatsPerBar, beatMultipliers, globalCachedGridTemplate, sig);

            for (var variantIndex = 0; variantIndex < totalVariants; variantIndex++) {
                var variantSection = createVariantSection(variantIndex);
                for (var idx = 0; idx < liveInstrumentsMemory.length; idx++) {
                    appendSingleRowElement(
                        liveInstrumentsMemory[idx],
                        totalBars,
                        beatsPerBar,
                        beatMultipliers,
                        globalCachedGridTemplate,
                        variantIndex,
                        variantSection
                    );
                }
            }

            updatePrintLayoutPreference();
            return { sig: sig, multiplier: multiplier, beatMultipliers: beatMultipliers, stepsPerBar: stepsPerBar, totalBars: totalBars };
        }

        function applyContextualRhythm(layoutInfo) {
            var totalVariants = getSanitizedVariantsCount();

            for (var variantIndex = 0; variantIndex < totalVariants; variantIndex++) {
                var hihatRow = document.querySelector('.track-row[data-variant="' + variantIndex + '"][data-instrument="hihat"]');
                var snareRow = document.querySelector('.track-row[data-variant="' + variantIndex + '"][data-instrument="snare"]');
                var bassRow  = document.querySelector('.track-row[data-variant="' + variantIndex + '"][data-instrument="bass"]');
                if (!hihatRow || !snareRow || !bassRow) continue;

                var beatMultipliers = layoutInfo.beatMultipliers;
                var barSteps = layoutInfo.stepsPerBar;

                for (var bar = 0; bar < layoutInfo.totalBars; bar++) {
                    var barOffset = bar * barSteps;

                    if (layoutInfo.sig === '4/4') {
                        for (var b = 0; b < 4; b++) {
                            var stepIdx = barOffset + computeBeatStartOffset(beatMultipliers, b);
                            hihatRow.querySelector('[data-step="' + stepIdx + '"]').classList.add('active');
                            if (b === 0 || b === 2) {
                                bassRow.querySelector('[data-step="' + stepIdx + '"]').classList.add('active');
                            }
                            if (b === 1 || b === 3) {
                                snareRow.querySelector('[data-step="' + stepIdx + '"]').classList.add('active');
                            }
                        }
                    } else if (layoutInfo.sig === '3/4') {
                        for (var b = 0; b < 3; b++) {
                            var stepIdx = barOffset + computeBeatStartOffset(beatMultipliers, b);
                            hihatRow.querySelector('[data-step="' + stepIdx + '"]').classList.add('active');
                            if (b === 0) {
                                bassRow.querySelector('[data-step="' + stepIdx + '"]').classList.add('active');
                            } else {
                                snareRow.querySelector('[data-step="' + stepIdx + '"]').classList.add('active');
                            }
                        }
                    } else if (layoutInfo.sig === '2/4') {
                        for (var b = 0; b < 2; b++) {
                            var stepIdx = barOffset + computeBeatStartOffset(beatMultipliers, b);
                            hihatRow.querySelector('[data-step="' + stepIdx + '"]').classList.add('active');
                            if (b === 0) {
                                bassRow.querySelector('[data-step="' + stepIdx + '"]').classList.add('active');
                            } else {
                                snareRow.querySelector('[data-step="' + stepIdx + '"]').classList.add('active');
                            }
                        }
                    } else if (layoutInfo.sig === '6/8') {
                        for (var b = 0; b < 6; b++) {
                            var stepIdx = barOffset + computeBeatStartOffset(beatMultipliers, b);
                            hihatRow.querySelector('[data-step="' + stepIdx + '"]').classList.add('active');
                            if (b === 0) {
                                bassRow.querySelector('[data-step="' + stepIdx + '"]').classList.add('active');
                            }
                            if (b === 3) {
                                snareRow.querySelector('[data-step="' + stepIdx + '"]').classList.add('active');
                            }
                        }
                    }
                }
            }
        }

        function updatePrintLayoutPreference() {
            document.body.classList.remove('print-portrait', 'print-landscape');
            var shouldUsePortrait = false;
            var firstGrid = document.querySelector('.variant-section .grid-steps');
            var hasGridForPrintCheck = !!firstGrid;
            var hasShortBarCount = getSanitizedBarsCount() <= 2;
            var hasNarrowScrollWidth = hasGridForPrintCheck && hasShortBarCount && firstGrid.scrollWidth <= portraitPrintMaxWidth;
            var isNarrowEnough = globalCachedTotalSteps <= maxStepsForPortraitPrint || hasNarrowScrollWidth;
            if (getSanitizedVariantsCount() > 1 && isNarrowEnough) {
                shouldUsePortrait = true;
            }
            document.body.classList.add(shouldUsePortrait ? 'print-portrait' : 'print-landscape');
        }

        function handleConfigurationLifecycle(loadDefaultRhythm) {
            var savedVariants = null;
            if (!loadDefaultRhythm) {
                savedVariants = normalizeVariantNotesList(
                    extractAllVariantNotes(),
                    getSanitizedVariantsCount()
                );
            }

            var layoutInfo = buildNotationGrid();

            if (loadDefaultRhythm) {
                applyContextualRhythm(layoutInfo);
            } else if (savedVariants) {
                restoreAllVariantNotes(savedVariants);
            }
        }

        // Intercepts shareable link inputs or defaults to core workspace settings on fresh runtimes
        function initFromURLOrDefaults() {
            var params = new URLSearchParams(window.location.search);
            var defaultVariantCount = 1;
            beatSubOverrides = {};
            
            // Check for compressed format first
            if (params.has('c')) {
                var decompressed = decompressState(params.get('c'));
                if (decompressed) {
                    projectTitle.value = decompressed.title || defaultProjectTitle;
                    document.title = decompressed.title || defaultProjectTitle;
                    timeSigSelect.value = decompressed.time;
                    barsSelect.value = decompressed.bars;
                    compositionNotes.value = decompressed.notes || "";
                    variantsSelect.value = (decompressed.variants && decompressed.variants.length) || defaultVariantCount;
                    
                    var options = timeSigConfig[decompressed.time].subs;
                    subdivisionSelect.innerHTML = '';
                    for (var i = 0; i < options.length; i++) {
                        var opt = document.createElement('option');
                        opt.value = options[i].v;
                        opt.textContent = options[i].l;
                        subdivisionSelect.appendChild(opt);
                    }
                    subdivisionSelect.value = decompressed.sub;
                    
                    liveInstrumentsMemory = [];
                    var sourceTracks = (decompressed.variants && decompressed.variants[0] && decompressed.variants[0].tracks) || decompressed.tracks;
                    var savedVariants = [];
                    for (var variantIndex = 0; variantIndex < getSanitizedVariantsCount(); variantIndex++) {
                        savedVariants.push({});
                    }

                    for (var i = 0; i < sourceTracks.length; i++) {
                        var t = sourceTracks[i];
                        liveInstrumentsMemory.push({
                            id: t.id,
                            defaultName: t.name,
                            symbol: t.sym
                        });
                    }

                    if (decompressed.variants && decompressed.variants.length) {
                        for (var v = 0; v < decompressed.variants.length; v++) {
                            var variantTracks = decompressed.variants[v].tracks || [];
                            for (var j = 0; j < variantTracks.length; j++) {
                                savedVariants[v][variantTracks[j].id] = variantTracks[j].notes || [];
                            }
                        }
                    } else {
                        for (var k = 0; k < decompressed.tracks.length; k++) {
                            savedVariants[0][decompressed.tracks[k].id] = decompressed.tracks[k].notes || [];
                        }
                    }
                    savedVariants = normalizeVariantNotesList(savedVariants, getSanitizedVariantsCount());
                    
                    buildNotationGrid();
                    restoreAllVariantNotes(savedVariants);
                } else {
                    document.title = projectTitle.value;
                    compositionNotes.value = "";
                    variantsSelect.value = defaultVariantCount;
                    updateSubdivisionDropdown();
                    handleConfigurationLifecycle(true);
                }
            } else if (params.has('tracks')) {
                var titleVal = params.get('title') || defaultProjectTitle;
                var timeVal = params.get('time') || "4/4";
                var barsVal = params.get('bars') || "2";
                var subVal = params.get('sub') || "16th";
                var notesVal = params.get('notes') || "";
                
                projectTitle.value = titleVal;
                document.title = titleVal;
                timeSigSelect.value = timeVal;
                barsSelect.value = barsVal;
                compositionNotes.value = notesVal;
                
                var options = timeSigConfig[timeVal].subs;
                subdivisionSelect.innerHTML = '';
                for (var i = 0; i < options.length; i++) {
                    var opt = document.createElement('option');
                    opt.value = options[i].v;
                    opt.textContent = options[i].l;
                    subdivisionSelect.appendChild(opt);
                }
                subdivisionSelect.value = subVal;

                if (params.has('beatSubs')) {
                    try {
                        var parsedBeatSubs = JSON.parse(params.get('beatSubs'));
                        beatSubOverrides = {};
                        for (var key in parsedBeatSubs) {
                            if (parsedBeatSubs.hasOwnProperty(key)) {
                                beatSubOverrides[parseInt(key, 10)] = parsedBeatSubs[key];
                            }
                        }
                    } catch (e) {
                        beatSubOverrides = {};
                    }
                }

                try {
                    var parsedTracks = JSON.parse(params.get('tracks'));
                    var parsedVariants = params.has('variants') ? JSON.parse(params.get('variants')) : null;
                    liveInstrumentsMemory = [];
                    var savedVariants = [];
                    var sharedNotes = {};
                    
                    for (var i = 0; i < parsedTracks.length; i++) {
                        var t = parsedTracks[i];
                        liveInstrumentsMemory.push({
                            id: t.id,
                            defaultName: t.name,
                            symbol: t.sym
                        });
                        sharedNotes[t.id] = t.notes || [];
                    }

                    if (parsedVariants && parsedVariants.length) {
                        variantsSelect.value = parsedVariants.length;
                        for (var v = 0; v < parsedVariants.length; v++) {
                            var variantData = {};
                            var variantTracks = parsedVariants[v].tracks || [];
                            for (var j = 0; j < variantTracks.length; j++) {
                                variantData[variantTracks[j].id] = variantTracks[j].notes || [];
                            }
                            savedVariants.push(variantData);
                        }
                    } else {
                        variantsSelect.value = defaultVariantCount;
                        savedVariants.push(sharedNotes);
                    }
                    savedVariants = normalizeVariantNotesList(savedVariants, getSanitizedVariantsCount());
                    
                    buildNotationGrid();
                    restoreAllVariantNotes(savedVariants);
                } catch (e) {
                    console.error("Failed to parse tracks payload from parameter inputs", e);
                    variantsSelect.value = defaultVariantCount;
                    updateSubdivisionDropdown();
                    handleConfigurationLifecycle(true);
                }
            } else {
                document.title = projectTitle.value;
                compositionNotes.value = "";
                variantsSelect.value = defaultVariantCount;
                updateSubdivisionDropdown();
                handleConfigurationLifecycle(true);
            }
            
            // Core Fix: Forces QR rendering on original link hydration or bootup cycle
            updateNotesContainerClass();
            updateURL();
        }

        // --- localStorage Groove Management Functions ---
        
        // Get all saved grooves from localStorage
        function getAllSavedGrooves() {
            try {
                var groovesJson = localStorage.getItem('drukkit_grooves');
                if (!groovesJson) return [];
                return JSON.parse(groovesJson);
            } catch (e) {
                console.error("Failed to parse saved grooves", e);
                return [];
            }
        }

        // Save current groove to localStorage
        function saveGrooveToStorage(name) {
            try {
                var titleVal = projectTitle.value;
                var timeVal = timeSigSelect.value;
                var barsVal = barsSelect.value;
                var variantCount = getSanitizedVariantsCount();
                var subVal = subdivisionSelect.value;
                var notesVal = compositionNotes.value;
                var savedVariants = normalizeVariantNotesList(extractAllVariantNotes(), variantCount);
                var tracksPayload = buildTracksPayload(savedVariants[0] || {});
                var variantsPayload = buildVariantsPayload(savedVariants);
                var grooveId = generateGrooveId();

                var grooveData = {
                    id: grooveId,
                    name: name,
                    timestamp: new Date().toISOString(),
                    state: {
                        title: titleVal,
                        time: timeVal,
                        bars: barsVal,
                        sub: subVal,
                        notes: notesVal,
                        tracks: tracksPayload,
                        variants: variantCount > 1 ? variantsPayload : null
                    }
                };

                var allGrooves = getAllSavedGrooves();
                allGrooves.push(grooveData);
                localStorage.setItem('drukkit_grooves', JSON.stringify(allGrooves));
                return true;
            } catch (e) {
                console.error("Failed to save groove", e);
                alert('Failed to save groove. Check browser storage.');
                return false;
            }
        }

        function downloadGrooveAsJson() {
            var titleVal = projectTitle.value;
            var variantCount = getSanitizedVariantsCount();
            var savedVariants = normalizeVariantNotesList(extractAllVariantNotes(), variantCount);
            var tracksPayload = buildTracksPayload(savedVariants[0] || {});
            var variantsPayload = buildVariantsPayload(savedVariants);

            var grooveData = {
                title: titleVal,
                time: timeSigSelect.value,
                bars: barsSelect.value,
                sub: subdivisionSelect.value,
                notes: compositionNotes.value,
                tracks: tracksPayload,
                variants: variantCount > 1 ? variantsPayload : null
            };

            var json = JSON.stringify(grooveData, null, 2);
            var blob = new Blob([json], { type: 'application/json' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            var safeName = titleVal.trim().replace(/\s+/g, '_').replace(/[^a-z0-9_\-]/gi, '') || 'groove';
            a.href = url;
            a.download = safeName + '.json';
            a.click();
            URL.revokeObjectURL(url);
        }

        // Load a groove from localStorage
        function loadGrooveFromStorage(grooveId) {
            try {
                var allGrooves = getAllSavedGrooves();
                var groove = allGrooves.find(function(g) { return g.id === grooveId; });
                if (!groove) {
                    console.error("Groove not found");
                    return false;
                }

                var state = groove.state;
                projectTitle.value = state.title;
                document.title = state.title;
                timeSigSelect.value = state.time;
                barsSelect.value = state.bars;
                subdivisionSelect.value = state.sub;
                compositionNotes.value = state.notes;

                updateSubdivisionDropdown();
                subdivisionSelect.value = state.sub;

                var sourceTracks = state.tracks || (state.variants && state.variants[0] && state.variants[0].tracks) || [];
                liveInstrumentsMemory = [];
                for (var i = 0; i < sourceTracks.length; i++) {
                    var t = sourceTracks[i];
                    liveInstrumentsMemory.push({
                        id: t.id,
                        defaultName: t.name,
                        symbol: t.sym
                    });
                }

                var savedVariants = [];
                if (state.variants && state.variants.length) {
                    variantsSelect.value = state.variants.length;
                    for (var v = 0; v < state.variants.length; v++) {
                        var variantData = {};
                        var variantTracks = state.variants[v].tracks || [];
                        for (var j = 0; j < variantTracks.length; j++) {
                            variantData[variantTracks[j].id] = variantTracks[j].notes || [];
                        }
                        savedVariants.push(variantData);
                    }
                } else {
                    var legacyTracks = state.tracks || [];
                    variantsSelect.value = '1';
                    var savedData = {};
                    for (var k = 0; k < legacyTracks.length; k++) {
                        savedData[legacyTracks[k].id] = legacyTracks[k].notes || [];
                    }
                    savedVariants.push(savedData);
                }

                savedVariants = normalizeVariantNotesList(savedVariants, getSanitizedVariantsCount());
                buildNotationGrid();
                restoreAllVariantNotes(savedVariants);
                updateURL();
                return true;
            } catch (e) {
                console.error("Failed to load groove", e);
                alert('Failed to load groove.');
                return false;
            }
        }

        // Delete a groove from localStorage
        function deleteGrooveFromStorage(grooveId) {
            try {
                var allGrooves = getAllSavedGrooves();
                var filtered = allGrooves.filter(function(g) { return g.id !== grooveId; });
                localStorage.setItem('drukkit_grooves', JSON.stringify(filtered));
                return true;
            } catch (e) {
                console.error("Failed to delete groove", e);
                return false;
            }
        }

        // Format date for display
        function formatGrooveDate(isoString) {
            try {
                var date = new Date(isoString);
                var now = new Date();
                var diffMs = now - date;
                var diffMins = Math.floor(diffMs / msPerMinute);
                var diffHours = Math.floor(diffMs / msPerHour);
                var diffDays = Math.floor(diffMs / msPerDay);

                if (diffMins < 1) return "just now";
                if (diffMins < 60) return diffMins + " min" + (diffMins > 1 ? "s" : "") + " ago";
                if (diffHours < 24) return diffHours + " hour" + (diffHours > 1 ? "s" : "") + " ago";
                if (diffDays < 7) return diffDays + " day" + (diffDays > 1 ? "s" : "") + " ago";
                
                return date.toLocaleString([], {
                    year: 'numeric',
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            } catch (e) {
                return "unknown";
            }
        }

        function formatGrooveMeta(groove) {
            return groove.state.time + " / " + groove.state.bars + " bars / " + groove.state.sub + " • " + formatGrooveDate(groove.timestamp);
        }

        function createGrooveActionHandler(grooveId, callback) {
            return function() {
                callback(grooveId);
            };
        }

        function generateGrooveId() {
            if (window.crypto && typeof window.crypto.randomUUID === 'function') {
                return window.crypto.randomUUID();
            }

            if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
                var randomValues = new Uint32Array(2);
                window.crypto.getRandomValues(randomValues);
                return 'groove-' + randomValues[0].toString(36) + randomValues[1].toString(36);
            }

            grooveIdCounter += 1;
            return 'groove-' + new Date().getTime().toString(36) + '-' + grooveIdCounter.toString(36);
        }

        // Refresh the grooves list in the modal
        function refreshGroovesList() {
            var groovesList = document.getElementById('groovesList');
            var noGroovesMsg = document.getElementById('noGroovesMsg');
            var allGrooves = getAllSavedGrooves();

            if (allGrooves.length === 0) {
                groovesList.innerHTML = '';
                noGroovesMsg.style.display = 'block';
                return;
            }

            noGroovesMsg.style.display = 'none';
            groovesList.innerHTML = '';

            // Show the newest saved grooves first.
            for (var i = allGrooves.length - 1; i >= 0; i--) {
                var groove = allGrooves[i];
                var item = document.createElement('div');
                item.className = 'groove-item';

                var info = document.createElement('div');
                info.className = 'groove-item-info';

                var nameEl = document.createElement('div');
                nameEl.className = 'groove-item-name';
                nameEl.textContent = groove.name;
                info.appendChild(nameEl);

                var metaEl = document.createElement('div');
                metaEl.className = 'groove-item-meta';
                metaEl.textContent = formatGrooveMeta(groove);
                info.appendChild(metaEl);

                item.appendChild(info);

                var actions = document.createElement('div');
                actions.className = 'groove-item-actions';

                var loadBtn = document.createElement('button');
                loadBtn.className = 'groove-load-btn';
                loadBtn.textContent = 'Load';
                loadBtn.onclick = createGrooveActionHandler(groove.id, function(id) {
                    if (loadGrooveFromStorage(id)) {
                        var loadModal = document.getElementById('loadModal');
                        loadModal.style.display = 'none';
                    }
                });
                actions.appendChild(loadBtn);

                var deleteBtn = document.createElement('button');
                deleteBtn.className = 'groove-delete-btn';
                deleteBtn.textContent = 'Delete';
                deleteBtn.onclick = createGrooveActionHandler(groove.id, function(id) {
                    if (confirm('Are you sure you want to delete this groove?')) {
                        deleteGrooveFromStorage(id);
                        refreshGroovesList();
                    }
                });
                actions.appendChild(deleteBtn);

                item.appendChild(actions);
                groovesList.appendChild(item);
            }
        }

        // --- Event Listeners ---
        projectTitle.oninput = function() {
            pushUndoSnapshot();
            document.title = this.value;
            updateURL();
        };

        compositionNotes.oninput = function() {
            pushUndoSnapshot();
            updateNotesContainerClass();
            updateURL();
        };

        timeSigSelect.onchange = function() {
            pushUndoSnapshot();
            beatSubOverrides = {};
            updateSubdivisionDropdown();
            handleConfigurationLifecycle(true);
            updateURL();
        };

        barsSelect.oninput = function() {
            pushUndoSnapshot();
            handleConfigurationLifecycle(false); 
            updateURL();
        };

        variantsSelect.oninput = function() {
            pushUndoSnapshot();
            this.value = getSanitizedVariantsCount();
            handleConfigurationLifecycle(false);
            updateURL();
        };

        subdivisionSelect.onchange = function() {
            pushUndoSnapshot();
            beatSubOverrides = {};
            handleConfigurationLifecycle(true);
            updateURL();
        };

        addTrackBtn.onclick = function() {
            pushUndoSnapshot();
            var sig = timeSigSelect.value;
            var currentSigConfig = timeSigConfig[sig];
            var totalBars = getSanitizedBarsCount();
            var subVal = subdivisionSelect.value;
            
            var currentSub = null;
            for (var s = 0; s < currentSigConfig.subs.length; s++) {
                if (currentSigConfig.subs[s].v === subVal) currentSub = currentSigConfig.subs[s];
            }
            if (!currentSub) currentSub = currentSigConfig.subs[0];
            
            var uniqueTrackId = "track_" + new Date().getTime();
            var newTrackObject = { id: uniqueTrackId, defaultName: "new track", symbol: "circle" };
            liveInstrumentsMemory.push(newTrackObject);
            handleConfigurationLifecycle(false);
            updateURL();
        };

        document.getElementById('clearBtn').onclick = function() {
            pushUndoSnapshot();
            var allSteps = document.querySelectorAll('.step');
            for (var i = 0; i < allSteps.length; i++) {
                allSteps[i].classList.remove('active', 'hand-R', 'hand-L', 'accent');
            }
            updateURL();
        };

        var themeBtn = document.getElementById('themeBtn');
        themeBtn.onclick = function() {
            document.body.classList.toggle('light-mode');
        };

        // --- Save/Load Groove Event Listeners ---

        // Save button
        document.getElementById('saveBtn').onclick = function() {
            var saveDialog = document.getElementById('saveDialog');
            var grooveNameInput = document.getElementById('grooveName');
            grooveNameInput.value = projectTitle.value;
            saveDialog.style.display = 'flex';
            grooveNameInput.focus();
        };

        // Save dialog cancel button
        document.getElementById('saveCancelBtn').onclick = function() {
            document.getElementById('saveDialog').style.display = 'none';
        };

        // Save dialog confirm button
        document.getElementById('saveConfirmBtn').onclick = function() {
            var grooveNameInput = document.getElementById('grooveName');
            var name = grooveNameInput.value.trim();
            
            if (!name) {
                alert('Please enter a groove name');
                return;
            }

            if (saveGrooveToStorage(name)) {
                document.getElementById('saveDialog').style.display = 'none';
                alert('Groove saved successfully!');
            }
        };

        // Allow Enter key to submit save dialog
        document.getElementById('grooveName').onkeypress = function(e) {
            if (e.key === 'Enter' || e.keyCode === 13) {
                document.getElementById('saveConfirmBtn').click();
            }
        };

        // Load button
        document.getElementById('loadBtn').onclick = function() {
            refreshGroovesList();
            document.getElementById('loadModal').style.display = 'flex';
        };

        // Download JSON button
        document.getElementById('downloadBtn').onclick = function() {
            downloadGrooveAsJson();
        };

        // Modal close button
        document.getElementById('modalClose').onclick = function() {
            document.getElementById('loadModal').style.display = 'none';
        };

        // Close modal when clicking outside content
        document.getElementById('loadModal').onclick = function(e) {
            if (e.target === this) {
                this.style.display = 'none';
            }
        };

        // Close save dialog when clicking outside content
        document.getElementById('saveDialog').onclick = function(e) {
            if (e.target === this) {
                this.style.display = 'none';
            }
        };

        headerMenuBtn.onclick = function() {
            toggleHeaderMenu();
        };

        document.addEventListener('click', function(event) {
            if (!headerMenuPanel.hidden && !event.target.closest('.header-menu')) {
                setHeaderMenuOpen(false);
            }
        });

        document.addEventListener('keydown', function(event) {
            if (event.key === 'Escape' && !headerMenuPanel.hidden) {
                setHeaderMenuOpen(false);
                headerMenuBtn.focus();
            }

            var tag = event.target.tagName;
            var isTypingField = tag === 'INPUT' || tag === 'TEXTAREA';
            if (isTypingField) return;

            var ctrl = event.ctrlKey || event.metaKey;
            if (ctrl && !event.shiftKey && event.key === 'z') {
                event.preventDefault();
                performUndo();
            } else if (ctrl && (event.key === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z'))) {
                event.preventDefault();
                performRedo();
            }
        });

        window.addEventListener('beforeprint', updatePrintLayoutPreference);
        window.addEventListener('afterprint', updatePrintLayoutPreference);

        // Initialize App Runtime
        initFromURLOrDefaults();
