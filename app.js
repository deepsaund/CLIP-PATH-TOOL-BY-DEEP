(function(){
	const overlay = document.getElementById('overlay');
	const targetBox = document.getElementById('targetBox');
	const preview = document.getElementById('preview');
	const zoomContainer = document.getElementById('zoomContainer');
	const stageWrapper = document.getElementById('stageWrapper');
	const modeSelect = document.getElementById('modeSelect');
	const shapeSelect = document.getElementById('shapeSelect');
	const widthInput = document.getElementById('boxWidth');
	const heightInput = document.getElementById('boxHeight');
	const zoomRange = document.getElementById('zoomRange');
	const resetBtn = document.getElementById('resetBtn');
	const addOuterBtn = document.getElementById('addOuterBtn');
	const addInnerBtn = document.getElementById('addInnerBtn');
	const deletePointBtn = document.getElementById('deletePointBtn');
	const snapCheckbox = document.getElementById('snapCheckbox');
	const gridCheckbox = document.getElementById('gridCheckbox');
	const gridSizeInput = document.getElementById('gridSizeInput');
	const fitBtn = document.getElementById('fitBtn');
	const centerBtn = document.getElementById('centerBtn');
	const cssOutput = document.getElementById('cssOutput');
	const copyBtn = document.getElementById('copyBtn');
	const undoBtn = document.getElementById('undoBtn');
	const redoBtn = document.getElementById('redoBtn');
	const curveSlider = document.getElementById('curveSlider');
	const curveValue = document.getElementById('curveValue');
	const curveEdgeLabel = document.getElementById('curveEdgeLabel');

	/** State */
	let outerPoints = [ {x:40,y:40},{x:360,y:40},{x:360,y:260},{x:40,y:260} ];
	let innerPoints = [];
	let selected = { which:null, index:-1 };
	let multiSelected = []; // array of {which, index}
	let isDragging = false;
	let zoomScale = 1;
	let history = [];
	let future = [];
	let edgeCurvature = {}; // key: `${which}:${startIdx}` => t (-200..200)

	function remapCurvatureOnInsert(which, insertAfterIdx){
		const list = which==='outer'? outerPoints : innerPoints;
		const n = list.length; // already includes the newly inserted point
		const oldKeys = Object.keys(edgeCurvature);
		const nextEdgeKey = `${which}:${insertAfterIdx}`;
		const splitT = edgeCurvature[nextEdgeKey] || 0;
		const updated = {};
		for(const k of oldKeys){
			if(!k.startsWith(which+':')){ updated[k] = edgeCurvature[k]; continue; }
			const s = parseInt(k.split(':')[1],10);
			if(s < insertAfterIdx){
				updated[k] = edgeCurvature[k];
			}else if(s === insertAfterIdx){
				// split edge: keep curvature on both new edges
				updated[`${which}:${insertAfterIdx}`] = splitT; // start -> new
				updated[`${which}:${(insertAfterIdx+1) % n}`] = splitT; // new -> old next
			}else{ // s > insertAfterIdx, shift start index by +1
				updated[`${which}:${s+1}`] = edgeCurvature[k];
			}
		}
		edgeCurvature = updated;
	}

	function remapCurvatureOnDelete(which, deletedIdx){
		const list = which==='outer'? outerPoints : innerPoints;
		const n = list.length; // already reflects the deletion
		const oldKeys = Object.keys(edgeCurvature);
		const updated = {};
		for(const k of oldKeys){
			if(!k.startsWith(which+':')){ updated[k] = edgeCurvature[k]; continue; }
			const s = parseInt(k.split(':')[1],10);
			if(s === deletedIdx){
				// deleted edge vanishes
				continue;
			} else if(s > deletedIdx){
				updated[`${which}:${s-1}`] = edgeCurvature[k];
			} else { // s < deletedIdx stays same
				updated[k] = edgeCurvature[k];
			}
		}
		edgeCurvature = updated;
	}

	function applyZoom(){
		zoomContainer.style.transform = `scale(${zoomScale})`;
	}

	function setZoomFromRange(){
		zoomScale = Math.max(0.25, Math.min(4, (+zoomRange.value)/100));
		applyZoom();
	}

	function snap(n){
		if(!snapCheckbox.checked) return n;
		const g = Math.max(1, +gridSizeInput.value || 20);
		return Math.round(n/g)*g;
	}

	function setBoxSize(){
		targetBox.style.width = widthInput.value + 'px';
		targetBox.style.height = heightInput.value + 'px';
		render();
	}

	widthInput.addEventListener('change', setBoxSize);
	heightInput.addEventListener('change', setBoxSize);
	zoomRange.addEventListener('input', setZoomFromRange);
	gridCheckbox.addEventListener('change', ()=>{
		if(gridCheckbox.checked){ targetBox.classList.add('grid'); }
		else { targetBox.classList.remove('grid'); }
	});
	gridSizeInput.addEventListener('change', ()=>{
		const g = Math.max(4, Math.min(200, +gridSizeInput.value||20));
		gridSizeInput.value = String(g);
		targetBox.style.setProperty('--grid', g+'px');
		targetBox.style.setProperty('--grid-major', (g*5)+'px');
		render();
	});

	fitBtn.addEventListener('click', ()=>{
		const boxW = targetBox.clientWidth;
		const boxH = targetBox.clientHeight;
		const wrapW = stageWrapper.clientWidth - 24;
		const wrapH = stageWrapper.clientHeight - 24;
		const s = Math.max(0.25, Math.min(4, Math.min(wrapW/boxW, wrapH/boxH)));
		zoomScale = s;
		zoomRange.value = String(Math.round(s*100));
		applyZoom();
		centerContent();
	});

	function centerContent(){
		const rect = zoomContainer.getBoundingClientRect();
		const wrapRect = stageWrapper.getBoundingClientRect();
		// Use scroll to center the scaled content
		const contentW = targetBox.clientWidth * zoomScale;
		const contentH = targetBox.clientHeight * zoomScale;
		const scrollLeft = Math.max(0, (contentW - wrapRect.width)/2);
		const scrollTop = Math.max(0, (contentH - wrapRect.height)/2);
		stageWrapper.scrollTo({ left: scrollLeft, top: scrollTop, behavior: 'smooth' });
	}

	centerBtn.addEventListener('click', centerContent);

	resetBtn.addEventListener('click', () => {
		outerPoints = [ {x:40,y:40},{x:+widthInput.value-40,y:40},{x:+widthInput.value-40,y:+heightInput.value-40},{x:40,y:+heightInput.value-40} ];
		innerPoints = [];
		selected = { which:null, index:-1 };
		multiSelected = [];
		edgeCurvature = {};
		pushHistory();
		render();
	});

	addOuterBtn.addEventListener('click', () => {
		outerPoints.push({x: snap(+widthInput.value/2), y: snap(+heightInput.value/2)});
		pushHistory();
		render();
	});
	addInnerBtn.addEventListener('click', () => {
		if(!innerPoints.length) shapeSelect.value = 'outer+inner';
		innerPoints.push({x: snap(+widthInput.value/2 - 40), y: snap(+heightInput.value/2 - 40)});
		pushHistory();
		render();
	});
	deletePointBtn.addEventListener('click', () => deleteSelected());

	document.addEventListener('keydown', (e)=>{
		if(e.key === 'Delete' || e.key === 'Backspace'){
			deleteSelected();
		}
	});

	function deleteSelected(){
		if(selected.which === 'outer' && selected.index >= 0){
			outerPoints.splice(selected.index,1);
			remapCurvatureOnDelete('outer', selected.index);
		}else if(selected.which === 'inner' && selected.index >= 0){
			innerPoints.splice(selected.index,1);
			remapCurvatureOnDelete('inner', selected.index);
		}
		selected = { which:null, index:-1 };
		multiSelected = [];
		pushHistory();
		render();
	}

	function createSvgEl(tag, attrs){
		const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
		for(const k in attrs) el.setAttribute(k, String(attrs[k]));
		return el;
	}

	function catmullRomToBezier(points, closed){
		if(points.length < 2) return '';
		const pts = points.slice();
		if(closed){
			pts.unshift(points[points.length-1]);
			pts.push(points[0], points[1]);
		}else{
			pts.unshift(points[0]);
			pts.push(points[points.length-1]);
		}
		let d = `M ${pts[1].x},${pts[1].y}`;
		for(let i=1;i<pts.length-2;i++){
			const p0 = pts[i-1], p1 = pts[i], p2 = pts[i+1], p3 = pts[i+2];
			const cp1x = p1.x + (p2.x - p0.x)/6;
			const cp1y = p1.y + (p2.y - p0.y)/6;
			const cp2x = p2.x - (p3.x - p1.x)/6;
			const cp2y = p2.y - (p3.y - p1.y)/6;
			d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
		}
		if(closed) d += ' Z';
		return d;
	}

	function polygonToPath(points){
		if(points.length === 0) return '';
		let d = `M ${points[0].x},${points[0].y}`;
		for(let i=1;i<points.length;i++) d += ` L ${points[i].x},${points[i].y}`;
		return d + ' Z';
	}

	// Percent path builders for CSS path() function
	function catmullRomToBezierPercent(points, closed){
		if(points.length < 2) return '';
		const pts = points.slice();
		if(closed){
			pts.unshift(points[points.length-1]);
			pts.push(points[0], points[1]);
		}else{
			pts.unshift(points[0]);
			pts.push(points[points.length-1]);
		}
		let d = `M ${pts[1].x}% ${pts[1].y}%`;
		for(let i=1;i<pts.length-2;i++){
			const p0 = pts[i-1], p1 = pts[i], p2 = pts[i+1], p3 = pts[i+2];
			const cp1x = p1.x + (p2.x - p0.x)/6;
			const cp1y = p1.y + (p2.y - p0.y)/6;
			const cp2x = p2.x - (p3.x - p1.x)/6;
			const cp2y = p2.y - (p3.y - p1.y)/6;
			d += ` C ${cp1x}% ${cp1y}% ${cp2x}% ${cp2y}% ${p2.x}% ${p2.y}%`;
		}
		if(closed) d += ' Z';
		return d;
	}

	function polygonToPathPercent(points){
		if(points.length === 0) return '';
		let d = `M ${points[0].x}% ${points[0].y}%`;
		for(let i=1;i<points.length;i++) d += ` L ${points[i].x}% ${points[i].y}%`;
		return d + ' Z';
	}

	function buildPathWithCurvesPercent(points, which){
		if(points.length<2) return '';
		let d = `M ${points[0].x}% ${points[0].y}%`;
		for(let i=0;i<points.length;i++){
			const a = points[i];
			const j = (i+1)%points.length;
			const b = points[j];
			const key = getEdgeKey(which, i);
			const t = edgeCurvature[key] || 0;
			if(t===0){
				if(i===0) d = `M ${a.x}% ${a.y}%`; else d += ` L ${a.x}% ${a.y}%`;
				if(j===0) d += ' Z';
				continue;
			}
			// Quadratic using midpoint and normal in percent space
			const mx = (a.x + b.x)/2;
			const my = (a.y + b.y)/2;
			const vx = b.x - a.x, vy = b.y - a.y;
			const len = Math.hypot(vx, vy) || 1;
			let nx = -vy/len, ny = vx/len;
			const cx = mx + nx * (t/10);
			const cy = my + ny * (t/10);
			if(i===0) d = `M ${a.x}% ${a.y}%`; else d += ` L ${a.x}% ${a.y}%`;
			d += ` Q ${cx}% ${cy}% ${b.x}% ${b.y}%`;
			if(j===0) d += ' Z';
		}
		return d;
	}

	function render(){
		while(overlay.firstChild) overlay.removeChild(overlay.firstChild);
		const useCurve = modeSelect.value === 'curve';
		const closed = true;

		// Draw outer
		if(outerPoints.length){
			let d = polygonToPath(outerPoints);
			const curveAny = Object.keys(edgeCurvature).some(k=>k.startsWith('outer:') && edgeCurvature[k]!==0);
			if(curveAny) d = buildPathWithCurves(outerPoints, 'outer');
			else if(useCurve) d = catmullRomToBezier(outerPoints, closed);
			const outerPath = createSvgEl('path', { d, class: 'shape-path' });
			overlay.appendChild(outerPath);
			addSegmentHitAreas(outerPoints, 'outer');
		}

		// Draw inner (hole)
		if(shapeSelect.value === 'outer+inner' && innerPoints.length >= 3){
			let d = polygonToPath(innerPoints);
			const curveAny = Object.keys(edgeCurvature).some(k=>k.startsWith('inner:') && edgeCurvature[k]!==0);
			if(curveAny) d = buildPathWithCurves(innerPoints, 'inner');
			else if(useCurve) d = catmullRomToBezier(innerPoints, closed);
			const innerPath = createSvgEl('path', { d, class: 'inner-path' });
			overlay.appendChild(innerPath);
			addSegmentHitAreas(innerPoints, 'inner');
		}

		// Draw handles
		const drawHandles = (points, which)=>{
			points.forEach((p, idx)=>{
				const isSel = (selected.which===which && selected.index===idx) || multiSelected.some(s=>s.which===which && s.index===idx);
				const c = createSvgEl('circle', { cx:p.x, cy:p.y, r:6, class:'handle'+(isSel?' selected':'') });
				overlay.appendChild(c);
				c.addEventListener('mousedown', (e)=>{
					isDragging = true;
					if(e.ctrlKey){
						// toggle in multi select
						const pos = multiSelected.findIndex(s=>s.which===which && s.index===idx);
						if(pos>=0) multiSelected.splice(pos,1); else multiSelected.push({which,index:idx});
						if(multiSelected.length===1) selected = multiSelected[0];
					}else{
						selected = { which, index: idx };
						multiSelected = [];
					}
					e.stopPropagation();
					render(); // update selection highlight and curve UI immediately
				});
			});
		};
		drawHandles(outerPoints,'outer');
		if(shapeSelect.value === 'outer+inner') drawHandles(innerPoints,'inner');

		updateCssOutput();
		updateCurveUI();
	}

	function updateCssOutput(){
		const useCurve = modeSelect.value === 'curve';

		let css = '';
		const hasAnyCurves = useCurve || Object.keys(edgeCurvature).some(k=>edgeCurvature[k]!==0);
		if(hasAnyCurves){
			// Build pixel path data
			const build = (pts, which)=>{
				const hasEdge = Object.keys(edgeCurvature).some(k=>k.startsWith(which+':') && edgeCurvature[k]!==0);
				if(hasEdge) return buildPathWithCurves(pts, which);
				if(useCurve) return catmullRomToBezier(pts, true);
				return polygonToPath(pts);
			};
			const dOuter = build(outerPoints, 'outer');
			const hasInner = shapeSelect.value==='outer+inner' && innerPoints.length>=3;
			const dInner = hasInner ? build(innerPoints, 'inner') : '';
			css = `clip-path: path('${dOuter}${dInner?(' '+dInner):''}'${hasInner?', evenodd':''});`;
		}else{
			// polygon() with pixel coordinates when no curves/holes
			const outerPoly = outerPoints.map(p=>`${p.x}px ${p.y}px`).join(', ');
			if(shapeSelect.value==='outer+inner' && innerPoints.length>=3){
				// polygon can't do holes; use path() with pixels
				const dOuter = polygonToPath(outerPoints);
				const dInner = polygonToPath(innerPoints);
				css = `clip-path: path('${dOuter} ${dInner}', evenodd);`;
			}else{
				css = `clip-path: polygon(${outerPoly});`;
			}
		}
		cssOutput.value = css;
		// apply to preview layer (not overlay), so editor UI isn't clipped
		preview.style.clipPath = css.replace('clip-path:','').replace(';','').trim();
	}

	// canvas interactions - background click to add points
	overlay.addEventListener('mousedown', (e)=>{
		if((e.target).tagName.toLowerCase() === 'circle') return; // handled in circle
		const rect = overlay.getBoundingClientRect();
		const x = snap((e.clientX - rect.left) / zoomScale);
		const y = snap((e.clientY - rect.top) / zoomScale);
		// If clicked on segment hit area, it will be handled there (stopPropagation)
		if(shapeSelect.value === 'outer+inner' && e.shiftKey){
			innerPoints.push({x,y});
			selected = { which:'inner', index: innerPoints.length-1 };
		}else{
			outerPoints.push({x,y});
			selected = { which:'outer', index: outerPoints.length-1 };
		}
		pushHistory();
		render();
	});

	document.addEventListener('mousemove', (e)=>{
		if(!isDragging || selected.index<0) return;
		const rect = overlay.getBoundingClientRect();
		const rawX = (e.clientX - rect.left) / zoomScale;
		const rawY = (e.clientY - rect.top) / zoomScale;
		const x = snap(Math.max(0, Math.min(targetBox.clientWidth, rawX)));
		const y = snap(Math.max(0, Math.min(targetBox.clientHeight, rawY)));
		const list = selected.which==='outer' ? outerPoints : innerPoints;
		list[selected.index] = { x, y };
		render();
	});

	document.addEventListener('mouseup', ()=>{ if(isDragging){ isDragging = false; pushHistory(); } });

	// History
	function snapshot(){
		return {
			outer: JSON.parse(JSON.stringify(outerPoints)),
			inner: JSON.parse(JSON.stringify(innerPoints)),
			edge: JSON.parse(JSON.stringify(edgeCurvature))
		};
	}
	function pushHistory(){
		history.push(snapshot());
		if(history.length>200) history.shift();
		future = [];
	}
	function restore(state){
		outerPoints = JSON.parse(JSON.stringify(state.outer));
		innerPoints = JSON.parse(JSON.stringify(state.inner));
		edgeCurvature = JSON.parse(JSON.stringify(state.edge));
	}
	undoBtn.addEventListener('click', ()=>{
		if(history.length<=1) return;
		const curr = history.pop();
		future.push(curr);
		const prev = history[history.length-1];
		restore(prev);
		render();
	});
	redoBtn.addEventListener('click', ()=>{
		if(!future.length) return;
		const next = future.pop();
		history.push(snapshot());
		restore(next);
		render();
	});
	document.addEventListener('keydown', (e)=>{
		if(e.ctrlKey && e.key.toLowerCase()==='z'){ e.preventDefault(); undoBtn.click(); }
		if(e.ctrlKey && e.key.toLowerCase()==='y'){ e.preventDefault(); redoBtn.click(); }
	});

	// Curvature per-edge using quadratic Bezier midpoint offset
	function getEdgeKey(which, startIdx){ return `${which}:${startIdx}`; }
	function getAdjacency(){
		const activeWhich = selected.which || (multiSelected[0] && multiSelected[0].which);
		if(!activeWhich) return null;
		const list = activeWhich==='outer'? outerPoints : innerPoints;
		if(multiSelected.length===2 && multiSelected[0].which===multiSelected[1].which){
			let a = multiSelected[0].index, b = multiSelected[1].index;
			// ensure adjacent in closed polygon
			const n = list.length;
			const adj = (Math.abs(a-b)===1) || ((a===0 && b===n-1) || (b===0 && a===n-1));
			if(!adj) return null;
			// edge key uses lower index as start (wrapping)
			const start = (a===n-1 && b===0) ? a : Math.min(a,b);
			return { which: activeWhich, startIdx: start };
		}
		return null;
	}
	function updateCurveUI(){
		const adj = getAdjacency();
		if(!adj){
			curveEdgeLabel.textContent = 'Select two adjacent points';
			curveSlider.disabled = true;
			curveSlider.value = '0';
			curveValue.textContent = '0';
			return;
		}
		const key = getEdgeKey(adj.which, adj.startIdx);
		const t = edgeCurvature[key] || 0;
		curveEdgeLabel.textContent = `${adj.which} edge ${adj.startIdx}–${(adj.startIdx+1)%((adj.which==='outer'?outerPoints:innerPoints).length)}`;
		curveSlider.disabled = false;
		curveSlider.value = String(t);
		curveValue.textContent = String(t);
	}
	curveSlider.addEventListener('input', ()=>{
		const adj = getAdjacency(); if(!adj) return;
		const key = getEdgeKey(adj.which, adj.startIdx);
		edgeCurvature[key] = +curveSlider.value;
		curveValue.textContent = curveSlider.value;
		pushHistory();
		render();
	});

	// Render with quadratic curves per-edge (overrides global curve mode when t!=0)
	function buildPathWithCurves(points, which){
		if(points.length<2) return '';
		let d = `M ${points[0].x},${points[0].y}`;
		for(let i=0;i<points.length;i++){
			const a = points[i];
			const j = (i+1)%points.length;
			const b = points[j];
			const key = getEdgeKey(which, i);
			const t = edgeCurvature[key] || 0;
			if(t===0){
				if(i===0) d = `M ${a.x},${a.y}`; else d += ` L ${a.x},${a.y}`;
				if(j===0) d += ' Z';
				continue;
			}
			// Quadratic via midpoint offset along edge normal
			const mx = (a.x + b.x)/2;
			const my = (a.y + b.y)/2;
			const vx = b.x - a.x, vy = b.y - a.y;
			const len = Math.hypot(vx, vy) || 1;
			// normal pointing to inside (clockwise outer assumed)
			let nx = -vy/len, ny = vx/len;
			// t negative = outside; positive = inside
			const cx = mx + nx * (t/10);
			const cy = my + ny * (t/10);
			if(i===0) d = `M ${a.x},${a.y}`; else d += ` L ${a.x},${a.y}`;
			d += ` Q ${cx},${cy} ${b.x},${b.y}`;
			if(j===0) d += ' Z';
		}
		return d;
	}

	// Create invisible thick polylines for hit-testing segments to insert points
	function addSegmentHitAreas(points, which){
		for(let i=0;i<points.length;i++){
			const a = points[i];
			const b = points[(i+1)%points.length];
			const path = createSvgEl('path', { d: `M ${a.x},${a.y} L ${b.x},${b.y}`, stroke:'transparent', 'stroke-width': 16, fill:'none' });
			path.style.cursor = 'copy';
			overlay.appendChild(path);
			path.addEventListener('mousedown', (e)=>{
				e.stopPropagation();
				const rect = overlay.getBoundingClientRect();
				const px = (e.clientX - rect.left) / zoomScale;
				const py = (e.clientY - rect.top) / zoomScale;
				// Project click onto segment to find insertion point
				const vx = b.x - a.x, vy = b.y - a.y;
				const len2 = vx*vx + vy*vy || 1;
				let t = ((px - a.x)*vx + (py - a.y)*vy)/len2; t = Math.max(0, Math.min(1, t));
				const ix = snap(a.x + vx*t);
				const iy = snap(a.y + vy*t);
				const list = which==='outer'? outerPoints : innerPoints;
				list.splice(i+1, 0, { x: ix, y: iy });
				remapCurvatureOnInsert(which, i);
				selected = { which, index: i+1 };
				multiSelected = [];
				pushHistory();
				render();
			});
		}
	}

	modeSelect.addEventListener('change', render);
	shapeSelect.addEventListener('change', render);
	copyBtn.addEventListener('click', async ()=>{
		try{
			await navigator.clipboard.writeText(cssOutput.value);
			copyBtn.textContent = 'Copied';
			setTimeout(()=> copyBtn.textContent = 'Copy CSS', 1000);
		}catch(err){
			copyBtn.textContent = 'Copy failed';
			setTimeout(()=> copyBtn.textContent = 'Copy CSS', 1200);
		}
	});

	setBoxSize();
	setZoomFromRange();
	 render();
})();


