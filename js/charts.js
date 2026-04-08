// 简易图表库 (Canvas 实现)
const Charts = {
    // 颜色配置（更现代、柔和）
    colors: {
        '工作': '#22C55E',  // Green 500
        '事业': '#3B82F6',  // Blue 500
        '陪家人': '#F59E0B',// Amber 500
        '其它': '#94A3B8',  // Slate 400
        'grid': '#E2E8F0',  // Slate 200
        'text': '#64748B',  // Slate 500
        'title': '#0F172A'  // Slate 900
    },

    // 格式化时长显示（分钟数 -> 友好文本）
    formatDuration(minutes) {
        if (minutes === null || minutes === undefined || minutes === '' || isNaN(minutes)) {
            return '';
        }
        const mins = Math.round(Number(minutes));
        if (mins < 60) {
            return `${mins}分钟`;
        }
        const hours = Math.floor(mins / 60);
        const remainMins = mins % 60;
        if (remainMins === 0) {
            return `${hours}小时`;
        }
        return `${hours}小时${remainMins}分钟`;
    },

    // 关键：按 devicePixelRatio 设置 canvas 像素尺寸，彻底解决发糊
    setupHiDPICanvas(canvas) {
        const rect = canvas.getBoundingClientRect();
        // 允许 canvas 在初始时即使是 display:none 也要有尺寸（如果有 style 宽）
        const cssW = Math.max(1, Math.round(rect.width || parseFloat(canvas.style.width) || 300));
        const cssH = Math.max(1, Math.round(rect.height || parseFloat(canvas.style.height) || 150));
        const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));

        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);

        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // 之后所有绘制都用 CSS 像素坐标
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        return { ctx, W: cssW, H: cssH, dpr };
    },

    // 为自定义分类生成稳定颜色（HSL -> HEX）
    getColor(category) {
        if (!category) return this.colors['其它'];
        if (this.colors[category]) return this.colors[category];

        let hash = 0;
        for (let i = 0; i < category.length; i++) {
            hash = ((hash << 5) - hash) + category.charCodeAt(i);
            hash |= 0;
        }
        const hue = Math.abs(hash) % 360;
        const sat = 65; // 稍微降低饱和度，更耐看
        const light = 52;
        const hex = this.hslToHex(hue, sat, light);
        this.colors[category] = hex;
        return hex;
    },

    hslToHex(h, s, l) {
        s /= 100;
        l /= 100;
        const k = (n) => (n + h / 30) % 12;
        const a = s * Math.min(l, 1 - l);
        const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
        const toHex = (x) => {
            const hex = Math.round(255 * x).toString(16).padStart(2, '0');
            return hex;
        };
        return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
    },

    // 绘制饼图
    drawPieChart(canvasId, data) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const { ctx, W: width, H: height } = this.setupHiDPICanvas(canvas);
        const entries = Object.entries(data || {}).filter(([, v]) => (v || 0) > 0);
        const total = entries.reduce((a, [, b]) => a + b, 0);

        // 1) 先“保圆环尺寸”，再倒推左右列宽（避免小屏把圆环挤成一个小点）
        const padding = 18;
        const rByH = (height - padding * 2) / 2 * 0.90;
        // iPhone12 等窄屏：保证至少可读的圆环半径（再小就会出现你截图里的效果）
        const minRadius = Math.max(54, Math.min(78, Math.floor(Math.min(width, height) * 0.22)));

        // 初始列宽（稳定但不极端占位）
        let colW = Math.max(88, Math.min(180, Math.floor(width * 0.26)));
        let labelMargin = colW + 24; // 折线+间距

        // 根据“最小半径”限制 labelMargin：width - 2*labelMargin >= 2*minR/0.90
        const needAvailW = (2 * minRadius) / 0.90;
        const labelMarginMax = Math.max(56, Math.floor((width - needAvailW) / 2));
        if (labelMargin > labelMarginMax) {
            labelMargin = labelMarginMax;
            colW = Math.max(64, labelMargin - 24);
        }

        // 半径：同时受宽高约束
        const radius = Math.max(
            Math.min(rByH, minRadius),
            Math.min(width - labelMargin * 2, height - padding * 2) / 2 * 0.90
        );
        const centerX = width / 2;
        const centerY = height / 2;

        ctx.clearRect(0, 0, width, height);

        if (total === 0) {
            this.drawEmptyPie(ctx, centerX, centerY, radius);
            return;
        }

        let startAngle = -0.5 * Math.PI;
        const slices = [];

        for (const [category, value] of entries) {
            const sliceAngle = (value / total) * 2 * Math.PI;
            const endAngle = startAngle + sliceAngle;
            const midAngle = startAngle + sliceAngle / 2;

            // 扇区轻微炸裂效果
            const explode = Math.max(1.5, Math.min(3.5, radius * 0.02));
            const ox = Math.cos(midAngle) * explode;
            const oy = Math.sin(midAngle) * explode;

            ctx.beginPath();
            ctx.moveTo(centerX + ox, centerY + oy);
            ctx.arc(centerX + ox, centerY + oy, radius, startAngle, endAngle);
            ctx.closePath();
            ctx.fillStyle = this.getColor(category);
            ctx.fill();

            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 3;
            ctx.lineJoin = 'round';
            ctx.stroke();

            slices.push({ category, value, startAngle, endAngle, midAngle, color: this.getColor(category), ox, oy });
            startAngle = endAngle;
        }

        // 甜甜圈中心（内径随半径自适应：越小的圆，内径越大，避免文字压环）
        ctx.beginPath();
        const innerRatio = radius < 70 ? 0.72 : 0.65;
        ctx.arc(centerX, centerY, radius * innerRatio, 0, 2 * Math.PI);
        ctx.fillStyle = '#fff';
        ctx.fill();

        // 中心文字
        const totalText = this.formatDuration(total);
        const innerRadius = radius * innerRatio;
        const maxTextWidth = innerRadius * 1.55;
        
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = this.colors.title;
        
        let fontSize = 18;
        ctx.font = `700 ${fontSize}px system-ui, -apple-system, Segoe UI, Arial`;
        let textWidth = ctx.measureText(totalText).width;
        while (textWidth > maxTextWidth && fontSize > 11) {
            fontSize -= 1;
            ctx.font = `700 ${fontSize}px system-ui, -apple-system, Segoe UI, Arial`;
            textWidth = ctx.measureText(totalText).width;
        }
        
        ctx.fillText(totalText, centerX, centerY - 6);
        ctx.font = '11px system-ui, -apple-system, Segoe UI, Arial';
        ctx.fillStyle = this.colors.text;
        ctx.fillText('总投入', centerX, centerY + 16);

        this.drawPieCallouts(ctx, centerX, centerY, radius, slices, width, height, total, {
            colW
        });
    },

    drawPieCallouts(ctx, cx, cy, r, slices, W, H, total, opts = {}) {
        if (!slices || slices.length === 0) return;

        const padX = 10;
        const padY = 14;
        const minGap = 10;
        const colW = Math.max(64, Math.min(220, Math.floor(opts.colW || Math.floor(W * 0.26))));
        const fontSize = colW < 90 ? 9 : 10;
        const fontSpec = `600 ${fontSize}px system-ui, -apple-system, Segoe UI, Arial`;
        const lineH = fontSize + 4; // 行高
        
        // 关键：起点必须严格在圆环外
        const outR = r + 6;
        const rayLen = 10;     // 第一段射线长度
        const elbowXGap = 10;  // 第二段到列边缘的距离
        const underlineGap = 4;

        const ellipsisFit = (text, maxW) => {
            ctx.font = fontSpec;
            if (ctx.measureText(text).width <= maxW) return text;
            let t = text;
            while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
            return t.length ? (t + '…') : '';
        };

        // 规则：优先单行；太长=两行：分类名 / (时长+百分比)；还太长=三行：分类名 / 时长 / 百分比
        const buildLines = (category, durationText, pctText) => {
            ctx.font = fontSpec;
            const one = `${category} ${durationText} ${pctText}`;
            if (ctx.measureText(one).width <= colW) return [one];

            // 2行优先：分类名独占一行（太长则省略号），第二行“时间+百分比”
            const line1 = ellipsisFit(category, colW);
            const line2Raw = `${durationText} ${pctText}`;
            const line2 = ellipsisFit(line2Raw, colW);
            // 如果两行的第二行仍被截断很多（说明太长），改成三行更清晰
            if (ctx.measureText(line2Raw).width > colW * 1.05) {
                const l2 = ellipsisFit(durationText, colW);
                const l3 = ellipsisFit(pctText, colW);
                return [line1, l2, l3].filter(Boolean);
            }
            return [line1, line2].filter(Boolean);
        };
        
        // 分左右两侧
        const left = [];
        const right = [];

        slices.forEach(s => {
            const cos = Math.cos(s.midAngle);
            const sin = Math.sin(s.midAngle);
            const side = cos >= 0 ? 'right' : 'left';
            
            // 原始锚点 (圆环边缘)
            const anchorX = cx + (s.ox || 0) + cos * outR;
            const anchorY = cy + (s.oy || 0) + sin * outR;

            // 射线终点（第一段）
            const rayX = cx + (s.ox || 0) + cos * (outR + rayLen);
            const rayY = cy + (s.oy || 0) + sin * (outR + rayLen);
            
            // 初始排序依据：Y坐标
            const rawY = rayY;

            // 预先生成多行文本和高度（用于避让）
            const pctText = total ? `${((s.value / total) * 100).toFixed(1)}%` : '0.0%';
            const durationText = this.formatDuration(s.value);
            const lines = buildLines(s.category, durationText, pctText);
            const boxH = Math.max(lineH, lines.length * lineH);

            (side === 'right' ? right : left).push({
                ...s, 
                side, 
                cos, sin, 
                anchorX, anchorY,
                rayX, rayY,
                lines,
                boxH,
                rawY,
                y: rawY 
            });
        });

        // 布局算法：防止重叠
        const layoutSide = (items) => {
            if (!items.length) return;
            
            // 按Y排序
            items.sort((a, b) => a.rawY - b.rawY);
            
            // 1) 先向下推开（按实际 box 高度）
            for (let i = 1; i < items.length; i++) {
                const prev = items[i-1];
                const curr = items[i];
                const prevBottom = prev.y + prev.boxH / 2;
                const currTop = curr.y - curr.boxH / 2;
                const needTop = prevBottom + minGap;
                if (currTop < needTop) {
                    curr.y += (needTop - currTop);
                }
            }

            // 2) 底部边界回弹
            const last = items[items.length-1];
            const lastBottom = last.y + last.boxH / 2;
            if (lastBottom > H - padY) {
                const shift = lastBottom - (H - padY);
                items.forEach(it => it.y -= shift);
            }
            
            // 3) 顶部边界回弹
            const first = items[0];
            const firstTop = first.y - first.boxH / 2;
            if (firstTop < padY) {
                const shift = padY - firstTop;
                items.forEach(it => it.y += shift);
            }
        };

        layoutSide(left);
        layoutSide(right);

        // 绘制
        const drawItem = (it) => {
            const isRight = it.side === 'right';
            const labelY = it.y;
            
            ctx.font = fontSpec;
            const lines = Array.isArray(it.lines) ? it.lines : [];
            const maxLineW = lines.reduce((m, t) => Math.max(m, ctx.measureText(t).width), 0);

            const textX = isRight ? (W - padX) : padX;
            const textInnerX = isRight ? (textX - maxLineW - underlineGap) : (textX + maxLineW + underlineGap);

            // 第二段竖线的 X（固定在两侧列附近，形成稳定布局）
            const colX = isRight ? (W - padX - colW - elbowXGap) : (padX + colW + elbowXGap);
            
            ctx.strokeStyle = it.color;
            ctx.lineWidth = 1.1;
            ctx.beginPath();
            
            // 三段式连线：射线终点 -> 竖线 -> 水平到文字
            ctx.moveTo(it.anchorX, it.anchorY);
            ctx.lineTo(it.rayX, it.rayY);           // 1) 射线
            ctx.lineTo(colX, labelY);               // 2) 竖向/斜向过渡到列
            ctx.lineTo(textInnerX, labelY);          // 3) 水平到文字
            
            ctx.stroke();

            // 小圆点
            ctx.fillStyle = it.color;
            ctx.beginPath();
            ctx.arc(it.anchorX, it.anchorY, 2, 0, 2 * Math.PI);
            ctx.fill();

            // 文字
            ctx.fillStyle = '#374151';
            ctx.textAlign = isRight ? 'right' : 'left';
            ctx.textBaseline = 'top';
            const topY = labelY - (it.boxH || (lines.length * lineH)) / 2;
            lines.forEach((t, i) => {
                ctx.fillText(t, textX, topY + i * lineH);
            });
        };

        left.forEach(drawItem);
        right.forEach(drawItem);
    },

    drawEmptyPie(ctx, x, y, r) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 2 * Math.PI);
        ctx.strokeStyle = '#eee';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#999';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('无数据', x, y);
    },

    // 绘制折线图
    drawLineChart(canvasId, data, visibleCategories) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const { ctx, W, H } = this.setupHiDPICanvas(canvas);

        const padding = { top: 24, right: 16, bottom: 28, left: 42 };
        ctx.clearRect(0, 0, W, H);

        const dates = data.dates || [];
        if (!dates.length) {
            ctx.fillStyle = this.colors.text;
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('无数据', W/2, H/2);
            return;
        }

        let maxVal = 0;
        (visibleCategories || []).forEach(cat => {
            const values = data.datasets?.[cat] || [];
            maxVal = Math.max(maxVal, ...values);
        });
        maxVal = Math.max(maxVal * 1.12, 60);

        const chartW = W - padding.left - padding.right;
        const chartH = H - padding.top - padding.bottom;

        // 网格线
        ctx.strokeStyle = this.colors.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i <= 4; i++) {
            const y = padding.top + (chartH / 4) * i + 0.5;
            ctx.moveTo(padding.left, y);
            ctx.lineTo(W - padding.right, y);

            ctx.fillStyle = this.colors.text;
            ctx.font = '11px system-ui, -apple-system, Segoe UI, Arial';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            const val = Math.round(maxVal - (maxVal / 4) * i);
            ctx.fillText(val, padding.left - 8, y);
        }
        ctx.stroke();

        // X轴日期
        const step = Math.ceil(dates.length / 6);
        dates.forEach((date, i) => {
            if (i % step !== 0 && i !== dates.length - 1) return; // 始终显示最后一个日期
            const x = padding.left + (chartW / (dates.length - 1)) * i;
            ctx.fillStyle = this.colors.text;
            ctx.font = '11px system-ui, -apple-system, Segoe UI, Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(date.slice(5), x, H - padding.bottom + 6);
        });

        // 绘制折线
        (visibleCategories || []).forEach(cat => {
            const values = data.datasets?.[cat];
            if (!values) return;

            const color = this.getColor(cat);
            
            // 阴影线条（增加层次感）
            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2.4;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.beginPath();
            values.forEach((val, i) => {
                const x = padding.left + (chartW / (dates.length - 1)) * i;
                const y = padding.top + chartH - (val / maxVal) * chartH;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
            ctx.restore();

            // 数据点（外圈+白芯）
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            values.forEach((val, i) => {
                if (val <= 0) return;
                const x = padding.left + (chartW / (dates.length - 1)) * i;
                const y = padding.top + chartH - (val / maxVal) * chartH;
                ctx.beginPath();
                ctx.arc(x, y, 3, 0, 2 * Math.PI);
                ctx.fill();
                ctx.stroke();
            });
        });
    }
};
