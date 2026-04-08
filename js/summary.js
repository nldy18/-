// 总结报表功能
const Summary = {
    currentRange: 'week', // week, month, year
    chartData: null, // 缓存图表数据
    categories: [],          // 当前范围内分类（服务端分类 + 任务中出现的旧分类）
    visibleCategories: [],   // 折线图默认全选（会在 loadData 里初始化）

    init() {
        if (!Auth.requireAuth()) return;
        
        this.bindEvents();
        this.loadData();
        this.displayUserInfo();
    },

    displayUserInfo() {
        const userInfo = Auth.getUserInfo();
        if (userInfo) {
            const nicknameEl = document.getElementById('userNickname');
            if (nicknameEl) {
                nicknameEl.textContent = userInfo.nickname || '用户';
            }
        }
        
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                if (confirm('确定要退出登录吗？')) {
                    Auth.logout();
                }
            });
        }
    },

    bindEvents() {
        document.querySelectorAll('.summary-tab').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.summary-tab').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentRange = e.target.dataset.range;
                this.loadData();
            });
        });
    },

    getDateRange(type) {
        const now = new Date();
        // 设置为今天
        
        let start = new Date(now);
        let end = new Date(now);

        if (type === 'week') {
            // 本周（假设周一开始）
            const day = now.getDay(); // 0 is Sunday
            const diff = now.getDate() - day + (day === 0 ? -6 : 1);
            start.setDate(diff);
            end.setDate(start.getDate() + 6);
        } else if (type === 'month') {
            start.setDate(1);
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        } else if (type === 'year') {
            start.setMonth(0, 1);
            end.setMonth(11, 31);
        }

        return {
            start: Storage.formatDate(start),
            end: Storage.formatDate(end),
            startObj: start,
            endObj: end
        };
    },

    async loadData() {
        const { start, end, startObj, endObj } = this.getDateRange(this.currentRange);
        
        // 更新日期显示
        const dateRangeText = `${startObj.getFullYear()}年${startObj.getMonth()+1}月${startObj.getDate()}日 - ${endObj.getFullYear()}年${endObj.getMonth()+1}月${endObj.getDate()}日`;
        document.getElementById('dateRangeDisplay').textContent = dateRangeText;

        // 获取数据
        const tasks = await this.getTasksByRange(start, end);

        // 动态分类：以服务端分类为主，并补齐任务中出现的旧分类（比如改名/删分类前遗留）
        const serverCategories = await this.getCategoriesFromServer();
        const taskCategories = Array.from(new Set(tasks.map(t => t.category).filter(Boolean)));
        const merged = [];
        const pushUnique = (c) => { if (c && !merged.includes(c)) merged.push(c); };
        serverCategories.forEach(pushUnique);
        taskCategories.forEach(pushUnique);
        if (merged.length === 0) merged.push('其它');
        this.categories = merged;

        // 勾选状态：保留之前的选择，新增分类默认选中；若无任何选择则全选
        if (!Array.isArray(this.visibleCategories) || this.visibleCategories.length === 0) {
            this.visibleCategories = this.categories.slice();
        } else {
            const prev = new Set(this.visibleCategories);
            const next = this.categories.filter(c => prev.has(c));
            this.visibleCategories = (next.length > 0 ? next : this.categories.slice());
        }

        // 处理数据供图表使用
        this.processChartData(tasks, start, end);

        // 渲染 UI
        this.renderStats();
        this.renderDailyList(tasks);
        
        // 渲染图例（如果还未渲染或切换了数据导致可能变化）
        this.renderLegend();
    },

    async getCategoriesFromServer() {
        if (!Auth.isAuthenticated()) return [];
        try {
            const response = await fetch(`${Auth.API_BASE_URL}/api/categories`, {
                headers: Auth.getAuthHeaders()
            });
            if (response.status === 401) {
                Auth.logout();
                return [];
            }
            if (!response.ok) return [];
            const rows = await response.json();
            return Array.isArray(rows) ? rows.map(r => r.name).filter(Boolean) : [];
        } catch (e) {
            console.error('获取分类失败', e);
            return [];
        }
    },

    async getTasksByRange(start, end) {
        if (Auth.isAuthenticated()) {
            try {
                const response = await fetch(`${Auth.API_BASE_URL}/api/tasks?startDate=${start}&endDate=${end}`, {
                    headers: Auth.getAuthHeaders()
                });
                if (response.status === 401) {
                    Auth.logout();
                    return [];
                }
                if (response.ok) return await response.json();

                const text = await response.text().catch(() => '');
                console.error('获取总结数据失败:', response.status, text);
            } catch (e) {
                console.error(e);
            }
        }
        const allTasksMap = Storage.getAllTasks();
        const tasks = [];
        Object.keys(allTasksMap).forEach(date => {
            if (date >= start && date <= end) {
                tasks.push(...allTasksMap[date].map(t => ({...t, dateStr: date})));
            }
        });
        return tasks;
    },

    processChartData(tasks, startDateStr, endDateStr) {
        // 1. 饼图数据 (分类汇总) - 动态分类
        const pieData = {};
        const baseCats = (this.categories && this.categories.length) ? this.categories : ['其它'];
        baseCats.forEach(c => { pieData[c] = 0; });
        
        // 2. 折线图数据 (日期序列)
        const dates = [];
        let curr = new Date(startDateStr);
        const last = new Date(endDateStr);
        
        // 生成连续日期
        while (curr <= last) {
            dates.push(Storage.formatDate(curr));
            curr.setDate(curr.getDate() + 1);
        }

        const lineDatasets = {};
        Object.keys(pieData).forEach(c => { lineDatasets[c] = new Array(dates.length).fill(0); });

        tasks.forEach(task => {
            // 仅统计已完成的任务
            if (!task.completed) return;

            const actual = parseFloat(task.actualDuration);
            // 仅使用实际时长
            const duration = !isNaN(actual) ? actual : 0;

            if (duration <= 0) return;

            // 归类（如果任务里出现未在分类列表中的分类，也要纳入统计）
            const cat = task.category || '未分类';
            if (!Object.prototype.hasOwnProperty.call(pieData, cat)) {
                pieData[cat] = 0;
                lineDatasets[cat] = new Array(dates.length).fill(0);
                if (!this.categories.includes(cat)) this.categories.push(cat);
                if (!this.visibleCategories.includes(cat)) this.visibleCategories.push(cat);
            }
            
            // 累加饼图
            pieData[cat] += duration;

            // 累加折线图
            const dateIdx = dates.indexOf(task.dateStr);
            if (dateIdx !== -1) {
                lineDatasets[cat][dateIdx] += duration;
            }
        });

        this.chartData = {
            pie: pieData,
            line: {
                dates: dates,
                datasets: lineDatasets
            }
        };
    },

    renderStats() {
        if (!this.chartData) return;

        // 渲染饼图
        Charts.drawPieChart('pieChart', this.chartData.pie);

        // 渲染折线图 (根据勾选状态)
        Charts.drawLineChart('lineChart', this.chartData.line, this.visibleCategories);

        // 数值已改为饼图外侧标注（折线连接），不再在下方占空间
    },

    renderLegend() {
        const container = document.getElementById('chartLegend');
        if (!container) return;
        
        // 每次重建（数据量小），便于保持状态一致
        container.innerHTML = '';

        const cats = (this.categories && this.categories.length) ? this.categories : ['其它'];
        const selected = new Set(this.visibleCategories || []);
        const isAllSelected = cats.every(c => selected.has(c));

        const redraw = () => {
            if (this.chartData) {
                Charts.drawLineChart('lineChart', this.chartData.line, this.visibleCategories);
            }
        };

        const ensureAtLeastOne = () => {
            if (!Array.isArray(this.visibleCategories) || this.visibleCategories.length === 0) {
                this.visibleCategories = [cats[0]];
            }
        };

        const makePill = ({ text, color, active, onClick, ariaLabel }) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'legend-pill' + (active ? ' is-active' : '');
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
            if (ariaLabel) btn.setAttribute('aria-label', ariaLabel);
            if (color) btn.style.setProperty('--legend-color', color);

            // dot + text
            const dot = document.createElement('span');
            dot.className = 'legend-dot';
            const span = document.createElement('span');
            span.className = 'legend-text';
            span.textContent = text;
            btn.appendChild(dot);
            btn.appendChild(span);

            btn.addEventListener('click', onClick);
            return btn;
        };

        // 一键全选（精炼交互：不用点一堆 checkbox）
        container.appendChild(makePill({
            text: '全选',
            color: '#1777b3',
            active: isAllSelected,
            ariaLabel: '趋势：全选分类',
            onClick: () => {
                this.visibleCategories = cats.slice();
                redraw();
                this.renderLegend();
            }
        }));

        // 分类 pills
        cats.forEach(cat => {
            const active = selected.has(cat);
            container.appendChild(makePill({
                text: cat,
                color: Charts.getColor(cat),
                active,
                ariaLabel: `趋势：切换分类 ${cat}`,
                onClick: () => {
                    const next = new Set(this.visibleCategories || []);
                    if (next.has(cat)) next.delete(cat);
                    else next.add(cat);
                    this.visibleCategories = Array.from(next).filter(c => cats.includes(c));
                    ensureAtLeastOne();
                    redraw();
                    this.renderLegend();
                }
            }));
        });
    },

    renderDailyList(tasks) {
        const listEl = document.getElementById('dailyList');
        listEl.innerHTML = '';

        if (tasks.length === 0) {
            listEl.innerHTML = '<div style="text-align:center;color:#999;padding:20px;">此时间段无数据</div>';
            return;
        }

        const grouped = {};
        tasks.forEach(task => {
            const date = task.dateStr;
            if (!grouped[date]) grouped[date] = [];
            grouped[date].push(task);
        });

        const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

        sortedDates.forEach(date => {
            const dayTasks = grouped[date];
            const stats = {};
            const baseCats = (this.categories && this.categories.length) ? this.categories : ['其它'];
            baseCats.forEach(c => { stats[c] = 0; });
            
            dayTasks.forEach(task => {
                // 仅统计已完成的任务
                if (!task.completed) return;

                const actual = parseFloat(task.actualDuration);
                // 仅使用实际时长
                const duration = !isNaN(actual) ? actual : 0;
                
                if (duration <= 0) return;

                const cat = task.category || '未分类';
                if (!Object.prototype.hasOwnProperty.call(stats, cat)) stats[cat] = 0;
                stats[cat] += duration;
            });

            const total = Object.values(stats).reduce((a, b) => a + b, 0);
            const nonZeroCats = Object.keys(stats).filter(c => stats[c] > 0);
            const showCats = (nonZeroCats.length ? nonZeroCats : Object.keys(stats).slice(0, 4));
            const parts = showCats.map(c => `${c}${Charts.formatDuration(stats[c] || 0)}`);
            
            const dateObj = new Date(date);
            const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
            const dateDisplay = `${date} ${weekDays[dateObj.getDay()]}`;

            const item = document.createElement('div');
            item.className = 'daily-item';
            item.innerHTML = `
                <div class="daily-date">${dateDisplay}</div>
                <div class="daily-summary">
                    ${parts.length > 0 ? parts.join('、') : '无'}; 总共${Charts.formatDuration(total)}
                </div>
            `;
            listEl.appendChild(item);
        });
    }
};

document.addEventListener('DOMContentLoaded', () => {
    Summary.init();
});