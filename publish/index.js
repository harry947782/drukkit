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
        var subdivisionSelect = document.getElementById('subdivisionSelect');
        var addTrackBtn = document.getElementById('addTrackBtn');
        var projectTitle = document.getElementById('projectTitle');
        var compositionNotes = document.getElementById('compositionNotes');
        var printQrCode = document.getElementById('printQrCode');
        var headerMenuBtn = document.getElementById('headerMenuBtn');
        var headerMenuPanel = document.getElementById('headerMenuPanel');

        var globalCachedGridTemplate = "";
        var globalCachedTotalSteps = 0;
        var dragSrcRow = null;
        var defaultProjectTitle = "My Drum Groove Composition";

        function getSanitizedBarsCount() {
            var val = parseInt(barsSelect.value, 10);
            if (isNaN(val) || val < 1) return 1;
            return val;
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

        // Compression/decompression functions for QR code URL optimization
        function compressState(tracksPayload, timeVal, barsVal, subVal, titleVal, notesVal) {
            // Encode metadata: time (2 bits) + bars (4 bits) + sub (2 bits) + hasTitle (1 bit) + hasNotes (1 bit)
            // Bit layout (16-bit value):
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
            
            var metadata = (timeBits << 6) | (barsBits << 2) | (subBits << 0) | (hasTitle << 8) | (hasNotes << 9);
            
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
            
            // Encode each track's notes with proper length encoding
            data.push(tracksPayload.length);
            
            for (var t = 0; t < tracksPayload.length; t++) {
                var track = tracksPayload[t];
                var symIndex = findSymIndex(track.sym);
                var notes = track.notes || [];
                
                // Encode notes with variable-length format for offsets and 5 bits for note count (max 31)
                var noteParts = [];
                var lastIdx = -1;
                
                for (var n = 0; n < notes.length; n++) {
                    var note = notes[n];
                    var idx = note.i;
                    var offset = idx - lastIdx - 1;
                    var stateMap = {'A': 0, 'R': 1, 'L': 2};
                    var stateBits = stateMap[note.s] || 0;
                    var accentBit = (note.a) ? 1 : 0;
                    
                    // Validate offset doesn't exceed 12-bit limit (4095)
                    if (offset > 4095) {
                        console.warn('Note offset ' + offset + ' exceeds maximum 4095, compression may be lossy');
                    }
                    
                    // Encode as: offset (variable length) + state (2 bits) + accent (1 bit)
                    // For offsets < 32: single byte = [offset(5) | state(2) | accent(1)]
                    // For offsets >= 32: two bytes = [0x80 | lo7(offset), hi8(offset) | state(2) | accent(1)]
                    if (offset < 32) {
                        noteParts.push((offset << 3) | (stateBits << 1) | accentBit);
                    } else {
                        // Multi-byte encoding: split offset across bytes, state and accent in second byte
                        noteParts.push(0x80 | (offset & 0x7F));  // First byte: continuation bit + low 7 bits of offset
                        var offsetHi = (offset >> 7) & 0x1F;  // High bits of offset (5 bits max for 12-bit offset)
                        noteParts.push((offsetHi << 3) | (stateBits << 1) | accentBit);  // Second byte: high offset | state | accent
                    }
                    lastIdx = idx;
                }
                
                // Validate note count doesn't exceed 31 (5-bit field)
                if (notes.length > 31) {
                    console.warn('Track has ' + notes.length + ' notes, but compression supports max 31 per track. Notes will be truncated.');
                }
                
                // Pack track header: symbol (3 bits) + note count (5 bits, max 31 notes per track)
                data.push((symIndex << 5) | Math.min(noteParts.length, 31));
                
                // Add note data (but only up to 31 notes due to 5-bit count limit)
                for (var np = 0; np < Math.min(noteParts.length, 31); np++) {
                    data.push(noteParts[np] & 0xFF);
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
                // Bit layout: bits 9 (hasNotes), bit 8 (hasTitle), bits 6-7 (time), bits 2-5 (bars), bits 0-1 (sub)
                var metadata = (allData.charCodeAt(idx++) << 8) | allData.charCodeAt(idx++);
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
                
                for (var t = 0; t < trackCount && t < liveInstrumentsMemory.length; t++) {
                    var trackByte = allData.charCodeAt(idx++);
                    var symIndex = (trackByte >> 5) & 0x7;
                    var noteCount = trackByte & 0x1F;  // 5 bits for note count (max 31)
            
                    var decompNotes = [];
                    var lastIdx = -1;
                    var stateReverseMap = {0: 'A', 1: 'R', 2: 'L'};
                    
                    for (var n = 0; n < noteCount; n++) {
                        var b1 = allData.charCodeAt(idx++);
                        var offset, stateBits, accentBit;
                        
                        if (b1 & 0x80) {
                            // Multi-byte encoding
                            var b2 = allData.charCodeAt(idx++);
                            var offsetLo = b1 & 0x7F;
                            var offsetHi = (b2 >> 3) & 0x1F;
                            offset = offsetLo | (offsetHi << 7);
                            stateBits = (b2 >> 1) & 0x3;
                            accentBit = b2 & 0x1;
                        } else {
                            // Single-byte encoding
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
                    var inst = liveInstrumentsMemory[t];
                    decompTracks.push({
                        id: inst.id,
                        name: inst.defaultName,
                        sym: trackSym,
                        notes: decompNotes
                    });
                }
                
                return {
                    time: timeVal,
                    bars: barsVal,
                    sub: subVal,
                    title: titleVal,
                    notes: notesVal,
                    tracks: decompTracks
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
            var subVal = subdivisionSelect.value;
            var notesVal = compositionNotes.value;
            
            var savedNotes = extractCurrentNotes(); 
            var tracksPayload = liveInstrumentsMemory.map(function(inst) {
                return {
                    id: inst.id,
                    name: inst.defaultName,
                    sym: inst.symbol,
                    notes: savedNotes[inst.id] || []
                };
            });

            var params = new URLSearchParams();
            params.set('title', titleVal);
            params.set('time', timeVal);
            params.set('bars', barsVal);
            params.set('sub', subVal);
            params.set('notes', notesVal);
            params.set('tracks', JSON.stringify(tracksPayload));

            var newUrl = buildBaseUrl() + '?' + params.toString();
            window.history.replaceState({ path: newUrl }, '', newUrl);

            // Generate compressed URL for QR code
            if (printQrCode) {
                var compressed = compressState(tracksPayload, timeVal, barsVal, subVal, titleVal, notesVal);
                var qrParams = new URLSearchParams();
                qrParams.set('c', compressed);
                var qrUrl = buildBaseUrl() + '?' + qrParams.toString();
                printQrCode.src = "https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=" + encodeURIComponent(qrUrl);
            }
        }

        // Extracts all structural active marks from DOM rows, saving index + short state keys
        function extractCurrentNotes() {
            var savedData = {};
            var rows = document.querySelectorAll('.track-row:not(.header-row)');
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

        // Restores calculated active state tokens, preserving total historical link compatibility
        function restoreNotes(savedData) {
            var rows = document.querySelectorAll('.track-row:not(.header-row)');
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

        function executeBarCopy(fromBarIdx, toBarIdx) {
            if (fromBarIdx === toBarIdx) return; 

            var sig = timeSigSelect.value;
            var subVal = subdivisionSelect.value;
            var currentSigConfig = timeSigConfig[sig];
            var currentSub = currentSigConfig.subs.find(function(s) { return s.v === subVal; }) || currentSigConfig.subs[0];
            
            var stepsPerBar = currentSigConfig.beats * currentSub.m;
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

            var sig = timeSigSelect.value;
            var subVal = subdivisionSelect.value;
            var currentSigConfig = timeSigConfig[sig];
            var currentSub = currentSigConfig.subs.find(function(s) { return s.v === subVal; }) || currentSigConfig.subs[0];
            var stepsPerBar = currentSigConfig.beats * currentSub.m;

            var startDelIdx = targetBarIdx * stepsPerBar;
            var endDelIdx = startDelIdx + stepsPerBar;

            var savedNotes = extractCurrentNotes();
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

            barsSelect.value = currentBars - 1;
            buildNotationGrid();
            restoreNotes(newNotes);
            updateURL();
        }

        function executeOuterBarAddition(type) {
            var currentBars = getSanitizedBarsCount();
            if (currentBars >= 16) return; 

            var sig = timeSigSelect.value;
            var subVal = subdivisionSelect.value;
            var currentSigConfig = timeSigConfig[sig];
            var currentSub = currentSigConfig.subs.find(function(s) { return s.v === subVal; }) || currentSigConfig.subs[0];
            var stepsPerBar = currentSigConfig.beats * currentSub.m;

            var savedNotes = extractCurrentNotes();
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

            barsSelect.value = currentBars + 1;
            buildNotationGrid();
            restoreNotes(newNotes);
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

        function buildGridHeaderElement(totalBars, beatsPerBar, multiplier, gridStyleString, sig) {
            var headerRow = document.createElement('div');
            headerRow.classList.add('track-row', 'header-row');

            var labelSpacer = document.createElement('div');
            labelSpacer.classList.add('label-ctrls', 'header-label-spacer');
            labelSpacer.textContent = "Track / Beat";
            headerRow.appendChild(labelSpacer);

            var stepsContainer = document.createElement('div');
            stepsContainer.classList.add('grid-steps');
            stepsContainer.style.gridTemplateColumns = gridStyleString;

            var subLabels = [''];
            if (sig !== '6/8') {
                if (multiplier === 2) subLabels = ['', '&'];
                if (multiplier === 3) subLabels = ['', 'la', 'li'];
                if (multiplier === 4) subLabels = ['', 'e', '&', 'a'];
            } else {
                if (multiplier === 2) subLabels = ['', '&'];
            }

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
                    for (var s = 0; s < multiplier; s++) {
                        var countCell = document.createElement('div');
                        countCell.classList.add('header-count-cell');
                        
                        if (s === 0) {
                            countCell.textContent = (bt + 1); 
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

        function appendSingleRowElement(inst, totalBars, beatsPerBar, multiplier, gridStyleString) {
            var row = document.createElement('div');
            row.classList.add('track-row', 'sym-' + inst.symbol);
            row.setAttribute('data-instrument', inst.id);

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
                row.classList.remove('sym-' + inst.symbol);
                var nextIdx = (findSymIndex(inst.symbol) + 1) % symOptions.length;
                inst.symbol = symOptions[nextIdx].v;
                row.classList.add('sym-' + inst.symbol);
                symBtn.textContent = symOptions[nextIdx].label;
                symBtn.title = symOptions[nextIdx].title + ' — click to cycle symbol';
                updateURL();
            };
            labelCtrls.appendChild(symBtn);

            var input = document.createElement('input');
            input.type = 'text';
            input.classList.add('instrument-label-input');
            input.value = inst.defaultName;
            input.oninput = function() {
                inst.defaultName = this.value;
                updateURL();
            };
            labelCtrls.appendChild(input);

            var delBtn = document.createElement('button');
            delBtn.classList.add('delete-track-btn');
            delBtn.innerHTML = '&times;';
            delBtn.title = "Delete Track";
            delBtn.onclick = function() {
                for (var m = 0; m < liveInstrumentsMemory.length; m++) {
                    if (liveInstrumentsMemory[m].id === inst.id) {
                        liveInstrumentsMemory.splice(m, 1);
                        break;
                    }
                }
                row.remove(); 
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
                var insertAbove = row.classList.contains('drag-over-above');
                row.classList.remove('drag-over-above', 'drag-over-below');

                if (insertAbove) {
                    gridContainer.insertBefore(dragSrcRow, row);
                } else {
                    var nextSib = row.nextSibling;
                    if (nextSib) {
                        gridContainer.insertBefore(dragSrcRow, nextSib);
                    } else {
                        gridContainer.appendChild(dragSrcRow);
                    }
                }

                // Re-sync liveInstrumentsMemory to reflect the new DOM order
                var instMap = {};
                for (var m = 0; m < liveInstrumentsMemory.length; m++) {
                    instMap[liveInstrumentsMemory[m].id] = liveInstrumentsMemory[m];
                }
                var newOrder = [];
                var reorderedRows = gridContainer.querySelectorAll('.track-row:not(.header-row)');
                for (var r = 0; r < reorderedRows.length; r++) {
                    var rowId = reorderedRows[r].getAttribute('data-instrument');
                    if (instMap[rowId]) newOrder.push(instMap[rowId]);
                }
                liveInstrumentsMemory = newOrder;
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
                    for (var s = 0; s < multiplier; s++) {
                        var step = document.createElement('div');
                        step.classList.add('step');
                        step.setAttribute('data-step', globalStepIndex);

                        // State-Machine Engine: Cycles cleanly across 4 logical click vectors.
                        // Tapping the top 30% of an active cell toggles the accent mark (mobile-friendly
                        // alternative to right-click for touch devices that lack a secondary tap).
                        step.onclick = function(e) {
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
            gridContainer.appendChild(row);
        }

        function buildNotationGrid() {
            gridContainer.innerHTML = '';

            var sig = timeSigSelect.value;
            var subVal = subdivisionSelect.value;
            var totalBars = getSanitizedBarsCount();
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
            var stepsPerBar = beatsPerBar * multiplier;
            globalCachedTotalSteps = stepsPerBar * totalBars; 

            var trackColumnsTemplate = [];
            trackColumnsTemplate.push('36px'); 
            
            for (var b = 0; b < totalBars; b++) {
                if (b > 0) trackColumnsTemplate.push('36px');
                for (var bt = 0; bt < beatsPerBar; bt++) {
                    if (bt > 0) trackColumnsTemplate.push('20px');
                    for (var s = 0; s < multiplier; s++) {
                        trackColumnsTemplate.push('minmax(0, 1fr)');
                    }
                }
            }
            
            trackColumnsTemplate.push('36px'); 
            globalCachedGridTemplate = trackColumnsTemplate.join(' ');

            buildGridHeaderElement(totalBars, beatsPerBar, multiplier, globalCachedGridTemplate, sig);

            for (var idx = 0; idx < liveInstrumentsMemory.length; idx++) {
                appendSingleRowElement(liveInstrumentsMemory[idx], totalBars, beatsPerBar, multiplier, globalCachedGridTemplate);
            }

            return { sig: sig, multiplier: multiplier, stepsPerBar: stepsPerBar, totalBars: totalBars };
        }

        function applyContextualRhythm(layoutInfo) {
            var hihatRow = document.querySelector('.track-row[data-instrument="hihat"]');
            var snareRow = document.querySelector('.track-row[data-instrument="snare"]');
            var bassRow  = document.querySelector('.track-row[data-instrument="bass"]');
            if (!hihatRow || !snareRow || !bassRow) return;

            var mult = layoutInfo.multiplier;
            var barSteps = layoutInfo.stepsPerBar;

            for (var bar = 0; bar < layoutInfo.totalBars; bar++) {
                var barOffset = bar * barSteps;

                if (layoutInfo.sig === '4/4') {
                    for (var b = 0; b < 4; b++) {
                        var stepIdx = barOffset + (b * mult);
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
                        var stepIdx = barOffset + (b * mult);
                        hihatRow.querySelector('[data-step="' + stepIdx + '"]').classList.add('active');
                        if (b === 0) {
                            bassRow.querySelector('[data-step="' + stepIdx + '"]').classList.add('active');
                        } else {
                            snareRow.querySelector('[data-step="' + stepIdx + '"]').classList.add('active');
                        }
                    }
                } else if (layoutInfo.sig === '2/4') {
                    for (var b = 0; b < 2; b++) {
                        var stepIdx = barOffset + (b * mult);
                        hihatRow.querySelector('[data-step="' + stepIdx + '"]').classList.add('active');
                        if (b === 0) {
                            bassRow.querySelector('[data-step="' + stepIdx + '"]').classList.add('active');
                        } else {
                            snareRow.querySelector('[data-step="' + stepIdx + '"]').classList.add('active');
                        }
                    }
                } else if (layoutInfo.sig === '6/8') {
                    for (var b = 0; b < 6; b++) {
                        var stepIdx = barOffset + (b * mult);
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

        function handleConfigurationLifecycle(loadDefaultRhythm) {
            var savedNotes = null;
            if (!loadDefaultRhythm) {
                savedNotes = extractCurrentNotes();
            }

            buildNotationGrid();

            if (loadDefaultRhythm) {
                var currentSigConfig = timeSigConfig[timeSigSelect.value];
                var currentSub = currentSigConfig.subs.find(function(s) { return s.v === subdivisionSelect.value; }) || currentSigConfig.subs[0];
                applyContextualRhythm({
                    sig: timeSigSelect.value,
                    multiplier: currentSub.m,
                    stepsPerBar: currentSigConfig.beats * currentSub.m,
                    totalBars: getSanitizedBarsCount()
                });
            } else if (savedNotes) {
                restoreNotes(savedNotes);
            }
        }

        // Intercepts shareable link inputs or defaults to core workspace settings on fresh runtimes
        function initFromURLOrDefaults() {
            var params = new URLSearchParams(window.location.search);
            
            // Check for compressed format first
            if (params.has('c')) {
                var decompressed = decompressState(params.get('c'));
                if (decompressed) {
                    projectTitle.value = decompressed.title || defaultProjectTitle;
                    document.title = decompressed.title || defaultProjectTitle;
                    timeSigSelect.value = decompressed.time;
                    barsSelect.value = decompressed.bars;
                    compositionNotes.value = decompressed.notes || "";
                    
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
                    var savedData = {};
                    
                    for (var i = 0; i < decompressed.tracks.length; i++) {
                        var t = decompressed.tracks[i];
                        liveInstrumentsMemory.push({
                            id: t.id,
                            defaultName: t.name,
                            symbol: t.sym
                        });
                        savedData[t.id] = t.notes || [];
                    }
                    
                    buildNotationGrid();
                    restoreNotes(savedData);
                } else {
                    document.title = projectTitle.value;
                    compositionNotes.value = "";
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

                try {
                    var parsedTracks = JSON.parse(params.get('tracks'));
                    liveInstrumentsMemory = [];
                    var savedData = {};
                    
                    for (var i = 0; i < parsedTracks.length; i++) {
                        var t = parsedTracks[i];
                        liveInstrumentsMemory.push({
                            id: t.id,
                            defaultName: t.name,
                            symbol: t.sym
                        });
                        savedData[t.id] = t.notes || [];
                    }
                    
                    buildNotationGrid();
                    restoreNotes(savedData);
                } catch (e) {
                    console.error("Failed to parse tracks payload from parameter inputs", e);
                    updateSubdivisionDropdown();
                    handleConfigurationLifecycle(true);
                }
            } else {
                document.title = projectTitle.value;
                compositionNotes.value = "";
                updateSubdivisionDropdown();
                handleConfigurationLifecycle(true);
            }
            
            // Core Fix: Forces QR rendering on original link hydration or bootup cycle
            updateNotesContainerClass();
            updateURL();
        }

        // --- Event Listeners ---
        projectTitle.oninput = function() {
            document.title = this.value;
            updateURL();
        };

        compositionNotes.oninput = function() {
            updateNotesContainerClass();
            updateURL();
        };

        timeSigSelect.onchange = function() {
            updateSubdivisionDropdown();
            handleConfigurationLifecycle(true);
            updateURL();
        };

        barsSelect.oninput = function() {
            handleConfigurationLifecycle(false); 
            updateURL();
        };

        subdivisionSelect.onchange = function() {
            handleConfigurationLifecycle(true);
            updateURL();
        };

        addTrackBtn.onclick = function() {
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

            appendSingleRowElement(
                newTrackObject, 
                totalBars, 
                currentSigConfig.beats, 
                currentSub.m, 
                globalCachedGridTemplate
            );
            updateURL();
        };

        document.getElementById('clearBtn').onclick = function() {
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
        });

        // Initialize App Runtime
        initFromURLOrDefaults();
