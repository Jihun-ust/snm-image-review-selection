document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('csvFileInput');
    const emptyState = document.getElementById('emptyState');
    const tableContainer = document.getElementById('tableContainer');
    const dashboardStats = document.getElementById('dashboardStats');
    const resultsBody = document.getElementById('resultsBody');
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const chartContainer = document.getElementById('chartContainer');
    const heatmapToggle = document.getElementById('heatmapToggle');
    const heatmapLegendRow = document.getElementById('heatmapLegendRow');
    const stdToggle = document.getElementById('stdToggle');
    const stdToggleGroup = document.getElementById('stdToggleGroup');
    const acceptToggle = document.getElementById('acceptToggle');
    const acceptToggleGroup = document.getElementById('acceptToggleGroup');
    const acceptMarginControl = document.getElementById('acceptMarginControl');
    const acceptMarginSlider = document.getElementById('acceptMarginSlider');
    const acceptMarginValue = document.getElementById('acceptMarginValue');

    // Stats Elements
    const totalSessionsEl = document.getElementById('totalSessions');
    const totalRecordsEl = document.getElementById('totalRecords');
    const overallAvgTimeEl = document.getElementById('overallAvgTime');

    // Overlay Elements
    const referenceBtn = document.getElementById('referenceBtn');
    const imageOverlay = document.getElementById('imageOverlay');
    const closeOverlayBtn = document.getElementById('closeOverlayBtn');

    if (referenceBtn) {
        referenceBtn.addEventListener('click', () => {
            imageOverlay.style.display = 'flex';
        });
    }

    if (closeOverlayBtn) {
        closeOverlayBtn.addEventListener('click', () => {
            imageOverlay.style.display = 'none';
        });
    }

    if (imageOverlay) {
        imageOverlay.addEventListener('click', (e) => {
            if (e.target === imageOverlay) {
                imageOverlay.style.display = 'none';
            }
        });
    }

    // cutoff date: April 1st 2026
    const CUTOFF_DATE = new Date('2026-04-01T00:00:00Z');
    const dropZone = emptyState;

    // Interactive session filters (applied on top of the hardcoded rules above)
    const DEFAULT_FILTER_DATE = '2026-05-15';
    const DEFAULT_FILTER_COUNT = 100;
    const DAY_MS = 24 * 60 * 60 * 1000;
    const dateFilterSlider = document.getElementById('dateFilterSlider');
    const dateFilterValue = document.getElementById('dateFilterValue');
    const countFilterSlider = document.getElementById('countFilterSlider');
    const countFilterValue = document.getElementById('countFilterValue');
    const filterSummary = document.getElementById('filterSummary');
    let filterBaseDay = 0; // UTC ms of the date slider's value 0

    // State Management
    let globalFilteredData = [];
    let globalValidSessions = [];
    let uncheckedSessions = new Set(); // survives filter changes
    let scatterChart = null;
    let stdEllipses = null; // { center: {x, y}, rings: [{ label, points }], color } or null when hidden

    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            document.querySelectorAll('.session-checkbox').forEach(cb => {
                cb.checked = isChecked;
                if (isChecked) uncheckedSessions.delete(cb.dataset.session);
                else uncheckedSessions.add(cb.dataset.session);
            });
            renderScatterPlot();
        });
    }

    if (dateFilterSlider) dateFilterSlider.addEventListener('input', () => applyFilters());
    if (countFilterSlider) countFilterSlider.addEventListener('input', () => applyFilters());

    function dayFromDateStr(dateStr) {
        return Date.parse(dateStr + 'T00:00:00Z');
    }

    function clamp(v, lo, hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    // Fit both sliders to the loaded sessions and put them at their defaults
    function setupFilterSliders(sessions) {
        if (sessions.length === 0) return;
        const days = sessions.map(s => dayFromDateStr(s.date));
        const minDay = Math.min(...days);
        const maxDay = Math.max(...days);
        filterBaseDay = minDay;
        const maxIdx = Math.round((maxDay - minDay) / DAY_MS);
        dateFilterSlider.max = maxIdx;
        dateFilterSlider.value = clamp(
            Math.round((dayFromDateStr(DEFAULT_FILTER_DATE) - minDay) / DAY_MS), 0, maxIdx);

        const counts = sessions.map(s => s.count);
        const minCount = Math.min(...counts);
        const maxCount = Math.max(...counts);
        countFilterSlider.min = minCount;
        countFilterSlider.max = maxCount;
        countFilterSlider.value = clamp(DEFAULT_FILTER_COUNT, minCount, maxCount);
    }

    function applyFilters() {
        const fromDate = new Date(filterBaseDay + Number(dateFilterSlider.value) * DAY_MS)
            .toISOString().split('T')[0];
        const minCount = Number(countFilterSlider.value);
        dateFilterValue.textContent = fromDate;
        countFilterValue.textContent = `≥ ${minCount}`;

        const visible = globalValidSessions.filter(s =>
            s.date >= fromDate && s.count >= minCount && passesOwnerFilter(s.sessionId));
        filterSummary.textContent = `${visible.length} of ${globalValidSessions.length} sessions`;
        renderDashboard(visible);
    }

    // ---- Owner list (optional, kept only in this browser) ----
    // CSV with columns sessionid,owner — loaded separately from the raw data.
    const OWNER_STORAGE_KEY = 'snm-owner-map';
    const NO_OWNER = '__none__';
    const clearOwnersBtn = document.getElementById('clearOwnersBtn');
    const ownerFilter = document.getElementById('ownerFilter');
    const ownerChips = document.getElementById('ownerChips');
    const ownerStatus = document.getElementById('ownerStatus');
    const ownerColHeader = document.getElementById('ownerColHeader');

    let ownerMap = loadStoredOwners(); // Map<lowercase sessionId, owner> or null
    let ownerConflicts = 0;
    let excludedOwners = new Set();    // owner keys (or NO_OWNER) unticked in the filter
    let dataLoaded = false;

    function loadStoredOwners() {
        try {
            const raw = localStorage.getItem(OWNER_STORAGE_KEY);
            if (!raw) return null;
            const entries = JSON.parse(raw);
            return Array.isArray(entries) && entries.length ? new Map(entries) : null;
        } catch (e) {
            return null;
        }
    }

    function storeOwners() {
        try {
            if (ownerMap) localStorage.setItem(OWNER_STORAGE_KEY, JSON.stringify([...ownerMap]));
            else localStorage.removeItem(OWNER_STORAGE_KEY);
        } catch (e) { /* storage unavailable: owners last for this page only */ }
    }

    function ownerOf(sessionId) {
        return ownerMap && sessionId ? ownerMap.get(sessionId.trim().toLowerCase()) || null : null;
    }

    function passesOwnerFilter(sessionId) {
        if (!ownerMap) return true;
        return !excludedOwners.has(ownerOf(sessionId) || NO_OWNER);
    }

    function isOwnerCsv(fields) {
        const cols = (fields || []).map(f => f.trim().toLowerCase());
        return cols.includes('sessionid') && cols.includes('owner') && !cols.includes('timestamp');
    }

    function loadOwnerRows(rows) {
        const map = new Map();
        let conflicts = 0;
        rows.forEach(row => {
            const norm = {};
            Object.keys(row).forEach(k => { norm[k.trim().toLowerCase()] = row[k]; });
            const sid = (norm.sessionid || '').trim().toLowerCase();
            const owner = (norm.owner || '').trim().toUpperCase();
            if (!sid || !owner) return;
            if (map.has(sid) && map.get(sid) !== owner) conflicts++;
            map.set(sid, owner); // one owner per session: last row wins
        });
        if (map.size === 0) {
            alert('No sessionid/owner rows found in the owner list.');
            return;
        }
        ownerMap = map;
        ownerConflicts = conflicts;
        excludedOwners = new Set();
        storeOwners();
        refreshOwnerUI();
        if (dataLoaded) applyFilters();
    }

    function clearOwners() {
        ownerMap = null;
        ownerConflicts = 0;
        excludedOwners = new Set();
        storeOwners();
        refreshOwnerUI();
        if (dataLoaded) applyFilters();
    }

    if (clearOwnersBtn) clearOwnersBtn.addEventListener('click', clearOwners);

    function refreshOwnerUI() {
        const hasOwners = !!ownerMap;
        clearOwnersBtn.style.display = hasOwners ? '' : 'none';
        ownerFilter.style.display = hasOwners ? 'flex' : 'none';
        ownerColHeader.style.display = hasOwners ? '' : 'none';
        ownerChips.innerHTML = '';
        if (!hasOwners) return;

        // Session counts per owner among the loaded sessions
        const counts = new Map();
        const loadedIds = new Set();
        globalValidSessions.forEach(s => {
            loadedIds.add(s.sessionId.trim().toLowerCase());
            const key = ownerOf(s.sessionId) || NO_OWNER;
            counts.set(key, (counts.get(key) || 0) + 1);
        });

        const owners = [...new Set(ownerMap.values())].sort();
        owners.concat(NO_OWNER).forEach(key => {
            const label = document.createElement('label');
            label.className = 'owner-chip';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = !excludedOwners.has(key);
            cb.addEventListener('change', () => {
                if (cb.checked) excludedOwners.delete(key);
                else excludedOwners.add(key);
                if (dataLoaded) applyFilters();
            });
            const text = key === NO_OWNER ? 'No owner' : key;
            label.append(cb, dataLoaded ? `${text} (${counts.get(key) || 0})` : text);
            ownerChips.appendChild(label);
        });

        const notes = [`${ownerMap.size} sessions in owner list`];
        if (dataLoaded) {
            const unmatched = [...ownerMap.keys()].filter(id => !loadedIds.has(id)).length;
            if (unmatched) notes.push(`${unmatched} not among loaded sessions`);
        }
        if (ownerConflicts) notes.push(`${ownerConflicts} conflicting rows (last kept)`);
        ownerStatus.textContent = notes.join(' · ');
        ownerStatus.classList.toggle('warn', notes.length > 1);
    }

    if (heatmapToggle) {
        heatmapToggle.addEventListener('change', () => {
            renderScatterPlot();
        });
    }

    if (stdToggle) {
        stdToggle.addEventListener('change', () => {
            renderScatterPlot();
        });
    }

    if (acceptToggle) {
        acceptToggle.addEventListener('change', () => {
            renderScatterPlot();
        });
    }

    if (acceptMarginSlider) {
        acceptMarginSlider.addEventListener('input', () => {
            renderScatterPlot();
        });
    }

    function handleFile(file) {
        if (!file) return;

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: function(results) {
                // An owner list dropped here is routed to the owner loader
                if (isOwnerCsv(results.meta.fields)) loadOwnerRows(results.data);
                else processData(results.data);
            },
            error: function(err) {
                console.error('Error parsing CSV:', err);
                alert('An error occurred while parsing the CSV file.');
            }
        });
    }

    fileInput.addEventListener('change', (e) => {
        handleFile(e.target.files[0]);
    });

    // Drag and Drop Logic
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
    });

    // Files can be dropped anywhere in the window: an owner list (sessionid,owner)
    // is detected and loaded as owners, anything else as raw data.
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    function parseTimestamp(tsString) {
        if (!tsString) return null;
        // The format is expected to be "YYYY-MM-DD HH:mm:ss.SSSSSS"
        // Convert to "YYYY-MM-DDTHH:mm:ss.SSSZ" to parse correctly in JS
        const normalized = tsString.replace(' ', 'T') + 'Z';
        return new Date(normalized);
    }

    function processData(data) {
        // 1. Filter: Delete all rows before April 1st 2026
        globalFilteredData = data.filter(row => {
            const rowDate = parseTimestamp(row.timestamp);
            return rowDate && rowDate >= CUTOFF_DATE;
        });

        // 2. Aggregate by sessionId
        const sessionMap = new Map();

        globalFilteredData.forEach(row => {
            const sid = row.sessionId;
            if (!sid) return; // Skip if no session id

            const ts = parseTimestamp(row.timestamp);
            if (!ts) return; // Skip if invalid timestamp

            if (!sessionMap.has(sid)) {
                sessionMap.set(sid, {
                    count: 0,
                    minTime: ts,
                    maxTime: ts
                });
            }

            const sessionData = sessionMap.get(sid);
            sessionData.count += 1;
            
            if (ts < sessionData.minTime) {
                sessionData.minTime = ts;
            }
            if (ts > sessionData.maxTime) {
                sessionData.maxTime = ts;
            }
        });

        // 3. Compute avg decision time for every session (used below as the
        // fallback decision time for each session's first record)
        sessionMap.forEach(sessionData => {
            const durationSec = (sessionData.maxTime - sessionData.minTime) / 1000;
            sessionData.durationSec = durationSec;
            sessionData.avgDecisionTimeSec = durationSec / sessionData.count;
        });

        // 4. Process rules and calculate metrics
        globalValidSessions = [];

        sessionMap.forEach((sessionData, sessionId) => {
            // Rule: exclude less than 50 records
            if (sessionData.count >= 50) {
                globalValidSessions.push({
                    sessionId,
                    date: sessionData.minTime.toISOString().split('T')[0],
                    count: sessionData.count,
                    totalTime: sessionData.durationSec,
                    avgDecisionTimeSec: sessionData.avgDecisionTimeSec
                });
            }
        });

        // 5. Compute per-record decision time: gap since the previous record
        // in the same session (sorted by timestamp); the first record of a
        // session falls back to that session's average decision time.
        const rowsBySession = new Map();
        globalFilteredData.forEach(row => {
            const sid = row.sessionId;
            if (!sid) return;
            if (!rowsBySession.has(sid)) rowsBySession.set(sid, []);
            rowsBySession.get(sid).push(row);
        });

        rowsBySession.forEach((rows, sid) => {
            const sessionData = sessionMap.get(sid);
            if (!sessionData) return;

            rows.sort((a, b) => parseTimestamp(a.timestamp) - parseTimestamp(b.timestamp));

            rows.forEach((row, i) => {
                if (i === 0) {
                    row.decisionTimeSec = sessionData.avgDecisionTimeSec;
                } else {
                    const prevTs = parseTimestamp(rows[i - 1].timestamp);
                    const ts = parseTimestamp(row.timestamp);
                    row.decisionTimeSec = (ts - prevTs) / 1000;
                }
            });
        });

        // 6. Render UI through the interactive filters
        uncheckedSessions = new Set();
        dataLoaded = true;
        setupFilterSliders(globalValidSessions);
        refreshOwnerUI();
        applyFilters();
    }

    function renderDashboard(sessions) {
        // Hide empty state
        emptyState.style.display = 'none';
        
        // Show dashboard content
        document.getElementById('dashboardContent').style.display = 'grid';

        // Clear existing rows
        resultsBody.innerHTML = '';

        // Sort sessions by date (ascending), then by count (descending)
        sessions = sessions.slice().sort((a, b) => {
            const dateDiff = a.date.localeCompare(b.date);
            if (dateDiff !== 0) return dateDiff;
            return b.count - a.count;
        });

        // Select-all reflects whether every visible session is checked
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = sessions.every(s => !uncheckedSessions.has(s.sessionId));
        }

        // Render rows
        sessions.forEach(session => {
            const tr = document.createElement('tr');
            
            const tdCheckbox = document.createElement('td');
            tdCheckbox.classList.add('checkbox-col');
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'session-checkbox';
            cb.checked = !uncheckedSessions.has(session.sessionId);
            cb.dataset.session = session.sessionId;
            cb.addEventListener('change', () => {
                if (cb.checked) uncheckedSessions.delete(session.sessionId);
                else uncheckedSessions.add(session.sessionId);
                if (selectAllCheckbox) {
                    selectAllCheckbox.checked = Array.from(document.querySelectorAll('.session-checkbox'))
                        .every(box => box.checked);
                }
                renderScatterPlot();
            });
            tdCheckbox.appendChild(cb);

            const tdDate = document.createElement('td');
            tdDate.textContent = session.date;

            const tdSession = document.createElement('td');
            // Show only first 8 chars of session ID if it's too long for aesthetics
            tdSession.textContent = session.sessionId.length > 16 
                ? session.sessionId.substring(0, 16) + '...' 
                : session.sessionId;
            tdSession.title = session.sessionId; // Full ID on hover

            const tdCount = document.createElement('td');
            tdCount.textContent = session.count;

            const tdAvgTime = document.createElement('td');
            tdAvgTime.textContent = session.avgDecisionTimeSec.toFixed(3);

            tr.appendChild(tdCheckbox);
            tr.appendChild(tdDate);
            tr.appendChild(tdSession);
            tr.appendChild(tdCount);
            tr.appendChild(tdAvgTime);

            if (ownerMap) {
                const tdOwner = document.createElement('td');
                tdOwner.textContent = ownerOf(session.sessionId) || '—';
                tr.appendChild(tdOwner);
            }

            resultsBody.appendChild(tr);
        });

        if (sessions.length === 0) {
            resultsBody.innerHTML = '<tr><td colspan="${ownerMap ? 6 : 5}" style="text-align: center; color: var(--text-secondary);">No sessions found meeting the criteria.</td></tr>';
        }

        renderScatterPlot();
    }

    function renderScatterPlot() {
        const checkedSessions = new Set(
            Array.from(document.querySelectorAll('.session-checkbox:checked')).map(cb => cb.dataset.session)
        );
        
        // Update Stats dynamically based on checked sessions
        const checkedSessionStats = globalValidSessions.filter(s => checkedSessions.has(s.sessionId));
        let totalRecords = 0;
        let totalTime = 0;
        checkedSessionStats.forEach(s => {
            totalRecords += s.count;
            totalTime += s.totalTime;
        });

        totalSessionsEl.textContent = checkedSessionStats.length;
        totalRecordsEl.textContent = totalRecords;
        const overallAvg = totalRecords > 0 ? (totalTime / totalRecords) : 0;
        overallAvgTimeEl.textContent = overallAvg.toFixed(2) + 's';

        const chartData = globalFilteredData.filter(row => checkedSessions.has(row.sessionId));

        const heatmapMode = !!(heatmapToggle && heatmapToggle.checked);

        const acceptData = [];
        const repositionData = [];
        let minTime = Infinity;
        let maxTime = -Infinity;

        chartData.forEach(row => {
            const angle = parseFloat(row.rotate);
            const depth = parseFloat(row.depth);
            if (isNaN(angle) || isNaN(depth)) return;

            const decisionTimeSec = row.decisionTimeSec;
            const pt = {
                x: angle,
                y: depth,
                filename: row.filename,
                sessionShort: row.sessionId ? row.sessionId.substring(0, 4) : 'N/A',
                owner: ownerOf(row.sessionId),
                decisionTimeSec
            };

            if (heatmapMode && decisionTimeSec != null && !isNaN(decisionTimeSec)) {
                if (decisionTimeSec < minTime) minTime = decisionTimeSec;
                if (decisionTimeSec > maxTime) maxTime = decisionTimeSec;
            }

            if (row.decision === 'accept') {
                acceptData.push(pt);
            } else if (row.decision === 'reposition') {
                repositionData.push(pt);
            }
        });

        if (acceptData.length > 0 || repositionData.length > 0) {
            chartContainer.style.display = 'flex';
        } else {
            chartContainer.style.display = 'none';
        }

        if (heatmapLegendRow) {
            heatmapLegendRow.style.visibility = heatmapMode ? 'visible' : 'hidden';
        }
        if (heatmapMode && isFinite(minTime) && isFinite(maxTime)) {
            updateHeatmapLegend(minTime, maxTime);
        }
        const timeRange = (maxTime - minTime) || 1;

        if (stdToggleGroup) {
            stdToggleGroup.style.display = heatmapMode ? 'flex' : 'none';
        }
        if (acceptToggleGroup) {
            acceptToggleGroup.style.display = heatmapMode ? 'none' : 'flex';
        }
        if (heatmapMode) {
            stdEllipses = (stdToggle && stdToggle.checked)
                ? computeStdEllipses(acceptData.concat(repositionData)) : null;
        } else {
            const acceptMode = !!(acceptToggle && acceptToggle.checked);
            const marginPct = acceptMarginSlider ? Number(acceptMarginSlider.value) : 25;
            if (acceptMarginControl) acceptMarginControl.style.display = acceptMode ? 'flex' : 'none';
            if (acceptMarginValue) acceptMarginValue.textContent = `±${marginPct}%`;
            stdEllipses = acceptMode ? computeAcceptEllipses(acceptData, marginPct) : null;
        }

        function styleDataset(label, data, shape, plainColor, plainBorderColor) {
            if (heatmapMode) {
                const colors = data.map(p => {
                    if (p.decisionTimeSec == null || isNaN(p.decisionTimeSec)) return 'rgba(148, 163, 184, 0.4)';
                    return decisionTimeToColor((p.decisionTimeSec - minTime) / timeRange);
                });
                return {
                    label,
                    data,
                    pointStyle: shape,
                    backgroundColor: colors,
                    borderColor: 'rgba(255, 255, 255, 0.25)',
                    borderWidth: 1,
                    pointRadius: 6,
                    pointHoverRadius: 8
                };
            }
            return {
                label,
                data,
                pointStyle: shape,
                backgroundColor: plainColor,
                borderColor: plainBorderColor,
                borderWidth: shape === 'circle' ? 2 : 1,
                pointRadius: 6,
                pointHoverRadius: 8
            };
        }

        const datasets = [
            styleDataset('Accept', acceptData, 'circle', 'transparent', '#3b82f6'),
            styleDataset('Reposition', repositionData, 'triangle', '#ef4444', '#dc2626')
        ];

        const ctx = document.getElementById('scatterPlot').getContext('2d');

        if (scatterChart) {
            scatterChart.data.datasets = datasets;
            scatterChart.update();
        } else {
            scatterChart = new Chart(ctx, {
                type: 'scatter',
                data: { datasets },
                plugins: [stdEllipsePlugin],
                options: {
                    animation: false,
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            type: 'linear',
                            position: 'bottom',
                            title: { display: true, text: 'Angle', color: '#94a3b8' },
                            grid: { color: 'rgba(255, 255, 255, 0.1)' },
                            ticks: { color: '#94a3b8' }
                        },
                        y: {
                            title: { display: true, text: 'Depth', color: '#94a3b8' },
                            grid: { color: 'rgba(255, 255, 255, 0.1)' },
                            ticks: { color: '#94a3b8' }
                        }
                    },
                    plugins: {
                        legend: {
                            labels: {
                                color: '#f8fafc',
                                usePointStyle: true,
                                generateLabels: function(chart) {
                                    return chart.data.datasets.map((dataset, i) => ({
                                        text: dataset.label,
                                        fillStyle: Array.isArray(dataset.backgroundColor) ? 'rgba(226, 232, 240, 0.7)' : dataset.backgroundColor,
                                        strokeStyle: dataset.borderColor,
                                        lineWidth: dataset.borderWidth,
                                        pointStyle: dataset.pointStyle,
                                        hidden: !chart.isDatasetVisible(i),
                                        datasetIndex: i
                                    }));
                                }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const pt = context.raw;
                                    const fname = pt.filename || 'Unknown File';
                                    const id = pt.owner ? `${pt.sessionShort} (${pt.owner})` : pt.sessionShort;
                                    const base = `ID: ${id} | ${fname}`;
                                    return pt.decisionTimeSec != null ? `${base} | ${pt.decisionTimeSec.toFixed(2)}s` : base;
                                }
                            }
                        }
                    }
                }
            });
        }
    }

    // Std boundaries: 1σ/2σ/3σ ellipses of where slow decisions concentrate in
    // angle-depth space. Each point is weighted by its decision time above the
    // median (capped at the 95th percentile so a single long pause can't
    // dominate); points at or below the median get zero weight.
    const STD_LEVELS = [1, 2, 3];
    const STD_LINE_DASHES = [[], [8, 5], [2, 4]];
    const STD_ELLIPSE_SEGMENTS = 72;

    function computeStdEllipses(points) {
        const valid = points.filter(p => p.decisionTimeSec != null && !isNaN(p.decisionTimeSec));
        if (valid.length < 3) return null;

        const times = valid.map(p => p.decisionTimeSec).sort((a, b) => a - b);
        const mid = Math.floor(times.length / 2);
        const median = times.length % 2 ? times[mid] : (times[mid - 1] + times[mid]) / 2;

        const excess = valid.map(p => Math.max(0, p.decisionTimeSec - median));
        const positive = excess.filter(w => w > 0).sort((a, b) => a - b);
        if (positive.length < 3) return null;
        const cap = positive[Math.floor(0.95 * (positive.length - 1))];
        const weights = excess.map(w => Math.min(w, cap));

        let wSum = 0, mx = 0, my = 0;
        valid.forEach((p, i) => {
            wSum += weights[i];
            mx += weights[i] * p.x;
            my += weights[i] * p.y;
        });
        if (wSum <= 0) return null;
        mx /= wSum;
        my /= wSum;

        let sxx = 0, sxy = 0, syy = 0;
        valid.forEach((p, i) => {
            const dx = p.x - mx;
            const dy = p.y - my;
            sxx += weights[i] * dx * dx;
            sxy += weights[i] * dx * dy;
            syy += weights[i] * dy * dy;
        });
        sxx /= wSum;
        sxy /= wSum;
        syy /= wSum;

        return buildEllipseRings(mx, my, sxx, sxy, syy,
            STD_LEVELS.map(k => ({ scale: k, label: `${k}σ` })), 'rgba(248, 250, 252, 0.85)');
    }

    // Accept boundaries (default mode): an ellipse fitted to the accept points
    // (unweighted mean + covariance), sized to enclose 90% of them, plus one
    // ring marginPct% tighter and one marginPct% more generous (slider-driven).
    const ACCEPT_COVERAGE = 0.9;

    function computeAcceptEllipses(points, marginPct) {
        const n = points.length;
        if (n < 3) return null;

        let mx = 0, my = 0;
        points.forEach(p => {
            mx += p.x;
            my += p.y;
        });
        mx /= n;
        my /= n;

        let sxx = 0, sxy = 0, syy = 0;
        points.forEach(p => {
            const dx = p.x - mx;
            const dy = p.y - my;
            sxx += dx * dx;
            sxy += dx * dy;
            syy += dy * dy;
        });
        sxx /= n;
        sxy /= n;
        syy /= n;

        const det = sxx * syy - sxy * sxy;
        if (!(det > 1e-9)) return null;

        // Mahalanobis distance of every accept point; the 90th percentile is
        // the ellipse scale that encloses 90% of them.
        const dists = points.map(p => {
            const dx = p.x - mx;
            const dy = p.y - my;
            return Math.sqrt((syy * dx * dx - 2 * sxy * dx * dy + sxx * dy * dy) / det);
        }).sort((a, b) => a - b);
        const base = dists[Math.max(0, Math.ceil(ACCEPT_COVERAGE * n) - 1)];
        if (!(base > 0)) return null;

        const margin = marginPct / 100;
        return buildEllipseRings(mx, my, sxx, sxy, syy, [
            { scale: base, label: 'Acceptance boundary' },
            { scale: base * (1 - margin), label: `-${marginPct}%` },
            { scale: base * (1 + margin), label: `+${marginPct}%` }
        ], '#3b82f6');
    }

    // Ellipse rings from a 2x2 covariance matrix; each level's `scale` is the
    // ring radius in standard deviations along the principal axes.
    function buildEllipseRings(mx, my, sxx, sxy, syy, levels, color) {
        const half = (sxx + syy) / 2;
        const diff = Math.sqrt(((sxx - syy) / 2) ** 2 + sxy * sxy);
        const l1 = half + diff;
        const l2 = half - diff;
        if (!(l2 > 1e-9)) return null; // degenerate (points on a line)

        const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        const r1 = Math.sqrt(l1);
        const r2 = Math.sqrt(l2);

        const rings = levels.map(level => {
            const pts = [];
            for (let i = 0; i < STD_ELLIPSE_SEGMENTS; i++) {
                const t = (i / STD_ELLIPSE_SEGMENTS) * 2 * Math.PI;
                const a = level.scale * r1 * Math.cos(t);
                const b = level.scale * r2 * Math.sin(t);
                pts.push({ x: mx + a * cosT - b * sinT, y: my + a * sinT + b * cosT });
            }
            return { label: level.label, points: pts };
        });

        return { center: { x: mx, y: my }, rings, color };
    }

    const stdEllipsePlugin = {
        id: 'stdEllipse',
        afterDatasetsDraw(chart) {
            if (!stdEllipses) return;
            const { ctx, chartArea, scales } = chart;
            const color = stdEllipses.color;

            ctx.save();
            ctx.beginPath();
            ctx.rect(chartArea.left, chartArea.top, chartArea.right - chartArea.left, chartArea.bottom - chartArea.top);
            ctx.clip();

            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.lineWidth = 1.5;
            ctx.font = '600 11px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';

            stdEllipses.rings.forEach((ring, idx) => {
                const px = ring.points.map(p => ({
                    x: scales.x.getPixelForValue(p.x),
                    y: scales.y.getPixelForValue(p.y)
                }));

                ctx.setLineDash(STD_LINE_DASHES[idx]);
                ctx.beginPath();
                px.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
                ctx.closePath();
                ctx.stroke();

                // Label at the highest point of the ring that is still inside the plot
                let anchor = null;
                px.forEach(p => {
                    const inside = p.x >= chartArea.left + 32 && p.x <= chartArea.right - 32 &&
                        p.y >= chartArea.top + 14 && p.y <= chartArea.bottom;
                    if (inside && (!anchor || p.y < anchor.y)) anchor = p;
                });
                if (anchor) ctx.fillText(ring.label, anchor.x, anchor.y - 3);
            });

            // Center marker
            const cx = scales.x.getPixelForValue(stdEllipses.center.x);
            const cy = scales.y.getPixelForValue(stdEllipses.center.y);
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(cx - 5, cy);
            ctx.lineTo(cx + 5, cy);
            ctx.moveTo(cx, cy - 5);
            ctx.lineTo(cx, cy + 5);
            ctx.stroke();

            ctx.restore();
        }
    };

    // Sequential blue ramp (light = fast, dark = slow), see dataviz skill palette
    const HEATMAP_RAMP = ['#cde2fb', '#5598e7', '#1c5cab', '#0d366b'];

    function hexToRgb(hex) {
        const n = parseInt(hex.slice(1), 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    function decisionTimeToColor(t) {
        const clamped = Math.max(0, Math.min(1, t));
        const segments = HEATMAP_RAMP.length - 1;
        const scaled = clamped * segments;
        const idx = Math.min(Math.floor(scaled), segments - 1);
        const localT = scaled - idx;
        const c0 = hexToRgb(HEATMAP_RAMP[idx]);
        const c1 = hexToRgb(HEATMAP_RAMP[idx + 1]);
        const r = Math.round(c0[0] + (c1[0] - c0[0]) * localT);
        const g = Math.round(c0[1] + (c1[1] - c0[1]) * localT);
        const b = Math.round(c0[2] + (c1[2] - c0[2]) * localT);
        return `rgb(${r}, ${g}, ${b})`;
    }

    function updateHeatmapLegend(minTime, maxTime) {
        const minLabel = document.getElementById('heatmapMinLabel');
        const maxLabel = document.getElementById('heatmapMaxLabel');
        if (minLabel) minLabel.textContent = minTime.toFixed(2) + 's';
        if (maxLabel) maxLabel.textContent = maxTime.toFixed(2) + 's';
    }
});
