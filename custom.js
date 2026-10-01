document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const setupPanel = document.getElementById('setup');
    const resultsArea = document.getElementById('results');
    const loader = document.getElementById('loader');
    const splitGrid = document.getElementById('split-grid');

    const previewImg = document.getElementById('preview-img');
    const gridOverlay = document.getElementById('grid-overlay');
    const presetRow = document.getElementById('preset-row');
    const colsInput = document.getElementById('cols-input');
    const rowsInput = document.getElementById('rows-input');
    const summaryLine = document.getElementById('summary-line');

    const splitBtn = document.getElementById('split-btn');
    const reselectBtn = document.getElementById('reselect-btn');
    const backBtn = document.getElementById('back-btn');
    const resetBtn = document.getElementById('reset-btn');
    const downloadAllBtn = document.getElementById('download-all-btn');
    const resolutionInfo = document.getElementById('resolution-info');

    let sourceImg = null;          // loaded Image object
    let sourceFile = null;         // original File
    let originalFilename = 'image';
    let processedFiles = [];

    const MAX = 20;

    // ---------- Upload handling ----------
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt =>
        dropZone.addEventListener(evt, preventDefaults, false));

    function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }

    ['dragenter', 'dragover'].forEach(evt =>
        dropZone.addEventListener(evt, () => dropZone.classList.add('dragover'), false));
    ['dragleave', 'drop'].forEach(evt =>
        dropZone.addEventListener(evt, () => dropZone.classList.remove('dragover'), false));

    dropZone.addEventListener('drop', (e) => {
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) loadImage(file);
        else alert('請上傳圖片檔案！');
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) loadImage(file);
    });

    function loadImage(file) {
        sourceFile = file;
        originalFilename = file.name.replace(/\.[^/.]+$/, '');
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                sourceImg = img;
                previewImg.src = e.target.result;
                dropZone.classList.add('hidden');
                resultsArea.classList.add('hidden');
                setupPanel.classList.remove('hidden');
                renderOverlay();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    // ---------- Cols / Rows controls ----------
    function getCols() { return clamp(parseInt(colsInput.value, 10) || 1); }
    function getRows() { return clamp(parseInt(rowsInput.value, 10) || 1); }
    function clamp(n) { return Math.min(MAX, Math.max(1, n)); }

    // Preset chips
    presetRow.addEventListener('click', (e) => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        colsInput.value = chip.dataset.cols;
        rowsInput.value = chip.dataset.rows;
        renderOverlay();
    });

    // Stepper +/- buttons
    document.querySelectorAll('.stepper-controls button').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = btn.dataset.target === 'cols' ? colsInput : rowsInput;
            input.value = clamp((parseInt(input.value, 10) || 1) + parseInt(btn.dataset.delta, 10));
            renderOverlay();
        });
    });

    [colsInput, rowsInput].forEach(input => {
        input.addEventListener('input', renderOverlay);
        input.addEventListener('change', () => { input.value = clamp(parseInt(input.value, 10) || 1); renderOverlay(); });
    });

    // Draw live grid overlay + update summary + highlight matching chip
    function renderOverlay() {
        const cols = getCols();
        const rows = getRows();

        gridOverlay.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        gridOverlay.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
        gridOverlay.innerHTML = '';
        let n = 1;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                const label = document.createElement('span');
                label.textContent = n++;
                cell.appendChild(label);
                gridOverlay.appendChild(cell);
            }
        }

        // Summary with per-cell output size
        if (sourceImg) {
            const cw = Math.round(sourceImg.width / cols);
            const ch = Math.round(sourceImg.height / rows);
            summaryLine.innerHTML =
                `將切成 <strong>${cols} × ${rows} = ${cols * rows}</strong> 張，每張約 <strong>${cw} × ${ch}</strong> px（原圖 ${sourceImg.width}×${sourceImg.height}）。`;
        }

        // Highlight matching preset
        document.querySelectorAll('.chip').forEach(chip => {
            chip.classList.toggle('active',
                parseInt(chip.dataset.cols, 10) === cols && parseInt(chip.dataset.rows, 10) === rows);
        });
    }

    // ---------- Navigation buttons ----------
    reselectBtn.addEventListener('click', resetToDrop);
    resetBtn.addEventListener('click', resetToDrop);

    backBtn.addEventListener('click', () => {
        resultsArea.classList.add('hidden');
        setupPanel.classList.remove('hidden');
    });

    function resetToDrop() {
        setupPanel.classList.add('hidden');
        resultsArea.classList.add('hidden');
        dropZone.classList.remove('hidden');
        fileInput.value = '';
        sourceImg = null;
        sourceFile = null;
        processedFiles = [];
        splitGrid.innerHTML = '';
    }

    // ---------- Split ----------
    splitBtn.addEventListener('click', () => {
        if (!sourceImg) return;
        setupPanel.classList.add('hidden');
        loader.classList.remove('hidden');
        // let the loader paint before heavy work
        setTimeout(processSplit, 30);
    });

    function processSplit() {
        const cols = getCols();
        const rows = getRows();
        const mimeType = sourceFile.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
        const extension = mimeType === 'image/jpeg' ? 'jpg' : 'png';

        const origW = sourceImg.width;
        const origH = sourceImg.height;
        processedFiles = [];

        // Pre-compute pixel boundaries (rounded so no edge pixels are lost)
        const xs = [];
        for (let c = 0; c <= cols; c++) xs.push(Math.round(c * origW / cols));
        const ys = [];
        for (let r = 0; r <= rows; r++) ys.push(Math.round(r * origH / rows));

        const total = cols * rows;
        const pad = String(total).length;
        let done = 0;
        let index = 0;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const sx = xs[c];
                const sw = xs[c + 1] - xs[c];
                const sy = ys[r];
                const sh = ys[r + 1] - ys[r];

                const canvas = document.createElement('canvas');
                canvas.width = sw;
                canvas.height = sh;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(sourceImg, sx, sy, sw, sh, 0, 0, sw, sh);

                const seq = index + 1;
                const label = `R${r + 1}C${c + 1}`;
                const filename = `${originalFilename}_${String(seq).padStart(pad, '0')}.${extension}`;
                index++;

                canvas.toBlob((blob) => {
                    processedFiles.push({
                        blob,
                        name: filename,
                        url: URL.createObjectURL(blob),
                        label,
                        seq
                    });
                    done++;
                    if (done === total) {
                        resolutionInfo.innerText = `${cols}×${rows}・共 ${total} 張`;
                        renderResults();
                    }
                }, mimeType, 1.0);
            }
        }
    }

    function renderResults() {
        loader.classList.add('hidden');
        resultsArea.classList.remove('hidden');
        processedFiles.sort((a, b) => a.seq - b.seq);

        splitGrid.innerHTML = '';
        processedFiles.forEach((fileObj) => {
            const card = document.createElement('div');
            card.className = 'img-card';
            card.innerHTML = `
                <div class="img-wrapper">
                    <img src="${fileObj.url}" alt="${fileObj.label}">
                </div>
                <div class="card-actions">
                    <span class="card-title">${fileObj.seq}. ${fileObj.label}</span>
                    <a href="${fileObj.url}" download="${fileObj.name}" class="btn-icon" title="下載此圖片">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    </a>
                </div>`;
            splitGrid.appendChild(card);
        });
    }

    // ---------- Download ZIP ----------
    downloadAllBtn.addEventListener('click', async () => {
        if (processedFiles.length === 0) return;
        try {
            const zip = new JSZip();
            const folder = zip.folder(`${originalFilename}_splits`);
            processedFiles.forEach((f) => folder.file(f.name, f.blob));
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            saveAs(zipBlob, `${originalFilename}_splits.zip`);
        } catch (err) {
            console.error('ZIP Generation error:', err);
            alert('打包 ZIP 時發生錯誤。');
        }
    });
});