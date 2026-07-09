document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('csvFileInput');
    const emptyState = document.getElementById('emptyState');
    const tableContainer = document.getElementById('tableContainer');
    const dashboardStats = document.getElementById('dashboardStats');
    const resultsBody = document.getElementById('resultsBody');
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const chartContainer = document.getElementById('chartContainer');
    
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

    // State Management
    let globalFilteredData = [];
    let globalValidSessions = [];
    let scatterChart = null;

    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            document.querySelectorAll('.session-checkbox').forEach(cb => {
                cb.checked = isChecked;
            });
            renderScatterPlot();
        });
    }

    function handleFile(file) {
        if (!file) return;

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: function(results) {
                processData(results.data);
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

    dropZone.addEventListener('drop', (e) => {
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

        // 3. Process rules and calculate metrics
        globalValidSessions = [];

        sessionMap.forEach((sessionData, sessionId) => {
            // Rule: exclude less than 50 records
            if (sessionData.count >= 50) {
                const durationMs = sessionData.maxTime - sessionData.minTime;
                const durationSec = durationMs / 1000;
                const avgDecisionTimeSec = durationSec / sessionData.count;

                globalValidSessions.push({
                    sessionId,
                    date: sessionData.minTime.toISOString().split('T')[0],
                    count: sessionData.count,
                    totalTime: durationSec,
                    avgDecisionTimeSec
                });
            }
        });

        // 4. Render UI
        renderDashboard(globalValidSessions);
    }

    function renderDashboard(sessions) {
        // Hide empty state
        emptyState.style.display = 'none';
        
        // Show dashboard content
        document.getElementById('dashboardContent').style.display = 'grid';

        // Clear existing rows
        resultsBody.innerHTML = '';

        // Sort sessions by date (ascending), then by count (descending)
        sessions.sort((a, b) => {
            const dateDiff = a.date.localeCompare(b.date);
            if (dateDiff !== 0) return dateDiff;
            return b.count - a.count;
        });

        // Reset select all checkbox
        if (selectAllCheckbox) selectAllCheckbox.checked = true;

        // Render rows
        sessions.forEach(session => {
            const tr = document.createElement('tr');
            
            const tdCheckbox = document.createElement('td');
            tdCheckbox.classList.add('checkbox-col');
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'session-checkbox';
            cb.checked = true;
            cb.dataset.session = session.sessionId;
            cb.addEventListener('change', () => {
                if (!cb.checked && selectAllCheckbox) {
                    selectAllCheckbox.checked = false;
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

            resultsBody.appendChild(tr);
        });

        if (sessions.length === 0) {
            resultsBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-secondary);">No sessions found meeting the criteria.</td></tr>';
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
        
        const acceptData = [];
        const repositionData = [];
        
        chartData.forEach(row => {
            const angle = parseFloat(row.rotate);
            const depth = parseFloat(row.depth);
            if (isNaN(angle) || isNaN(depth)) return;
            
            const pt = { 
                x: angle, 
                y: depth, 
                filename: row.filename,
                sessionShort: row.sessionId ? row.sessionId.substring(0, 4) : 'N/A'
            };
            if (row.decision === 'accept') {
                acceptData.push(pt);
            } else if (row.decision === 'reposition') {
                repositionData.push(pt);
            }
        });
        
        if (acceptData.length > 0 || repositionData.length > 0) {
            chartContainer.style.display = 'block';
        } else {
            chartContainer.style.display = 'none';
        }

        const ctx = document.getElementById('scatterPlot').getContext('2d');
        
        if (scatterChart) {
            scatterChart.data.datasets[0].data = acceptData;
            scatterChart.data.datasets[1].data = repositionData;
            scatterChart.update();
        } else {
            scatterChart = new Chart(ctx, {
                type: 'scatter',
                data: {
                    datasets: [
                        {
                            label: 'Accept',
                            data: acceptData,
                            backgroundColor: 'transparent', // do not fill
                            borderColor: '#3b82f6', // blue
                            borderWidth: 2,
                            pointRadius: 6, // slightly larger
                            pointHoverRadius: 8
                        },
                        {
                            label: 'Reposition',
                            data: repositionData,
                            backgroundColor: '#ef4444', // red
                            borderColor: '#dc2626',
                            borderWidth: 1
                        }
                    ]
                },
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
                            labels: { color: '#f8fafc' }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const pt = context.raw;
                                    const fname = pt.filename || 'Unknown File';
                                    return `ID: ${pt.sessionShort} | ${fname}`;
                                }
                            }
                        }
                    }
                }
            });
        }
    }
});
