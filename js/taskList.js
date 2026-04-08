// 时间清单功能
const TaskList = {
    currentDate: null,
    tasks: [],
    editingTaskIndex: null,
    editingActualTimeIndex: null,
    fabOpen: false,

    async init() {
        // 从URL获取日期参数
        const urlParams = new URLSearchParams(window.location.search);
        const dateStr = urlParams.get('date') || Storage.formatDate(new Date());
        this.currentDate = dateStr;

        // 显示当前日期
        this.displayCurrentDate();
        
        // 加载任务列表
        await this.loadTasks();
        
        // 加载分类
        this.loadCategories();
        
        // 绑定事件
        this.bindEvents();

        // 点击外部关闭菜单
        document.addEventListener('click', (e) => {
            // portal 后的菜单不在 .task-actions-menu 内，需要额外判断
            if (!e.target.closest('.task-actions-menu') && !e.target.closest('.task-menu-dropdown') && !e.target.closest('.task-menu-portal')) {
                this.closeAllMenus();
            }
            if (!e.target.closest('.fab-container')) {
                this.closeFabMenu();
            }
        });

        // 滚动/缩放时关闭菜单，避免 fixed 菜单错位
        window.addEventListener('scroll', () => this.closeAllMenus(), { passive: true });
        window.addEventListener('resize', () => this.closeAllMenus());

        // 视口切换时重绘（表格 <-> 卡片）
        this._isMobileCached = this.isMobileView();
        window.addEventListener('resize', () => {
            const next = this.isMobileView();
            if (next !== this._isMobileCached) {
                this._isMobileCached = next;
                this.renderTasks();
            }
        });
    },

    async loadCategories() {
        await Category.load();
        // 如果加载后列表为空（可能是网络问题或初始化失败），使用默认分类兜底渲染
        if (Category.list.length === 0) {
            Category.list = [{name: '工作', id: -1}, {name: '事业', id: -2}, {name: '陪家人', id: -3}, {name: '其它', id: -4}];
        }
        this.refreshCategorySelects();
        // 分类变更后（新增/改名/删除）需要同步刷新首页总结文案
        this.updateSummary();
    },

    refreshCategorySelects() {
        const categories = Category.list;
        const optionsHtml = categories.map(c => `<option value="${this.escapeHtml(c.name)}">${this.escapeHtml(c.name)}</option>`).join('') +
            '<option disabled>──────────</option>' +
            '<option value="manage_categories">⚙️ 管理...</option>';

        // 辅助函数：更新 select 并尝试保持选中值
        const updateSelect = (id) => {
            const select = document.getElementById(id);
            if (select) {
                const currentVal = select.value;
                select.innerHTML = optionsHtml;
                // 如果当前值在列表中，保持选中；否则选中第一个
                if (currentVal && categories.some(c => c.name === currentVal)) {
                    select.value = currentVal;
                } else if (categories.length > 0) {
                    select.value = categories[0].name;
                }
                // 重新绑定 change 事件（防止某些情况下失效，虽不常见但保险）
                select.onchange = (e) => this.handleCategoryChange(e);
            }
        };

        updateSelect('taskCategory');
        updateSelect('editTaskCategory');
    },

    handleCategoryChange(e) {
        if (e.target.value === 'manage_categories') {
            // 阻止选定“管理分类”
            // 立即重置为上一次有效值，或者第一个选项
            // 注意：data-prev-value 是在 focus 时设置的
            const select = e.target;
            const previousValue = select.getAttribute('data-prev-value') || (Category.list.length > 0 ? Category.list[0].name : '');
            
            // 延时重置，让用户看到点击效果但立刻回弹
            setTimeout(() => {
                select.value = previousValue;
            }, 0);
            
            // 打开管理弹窗
            Category.openManager();
        } else {
            // 更新上一有效值
            e.target.setAttribute('data-prev-value', e.target.value);
        }
    },

    isMobileView() {
        const byWidth = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
        const byPointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        return !!(byWidth || byPointer);
    },

    // 计算时间差（分钟）
    calculateDuration(startTime, endTime) {
        if (!startTime || !endTime) return 0;
        
        const [startHour, startMin] = startTime.split(':').map(Number);
        const [endHour, endMin] = endTime.split(':').map(Number);
        
        const startMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;
        
        // 处理跨天的情况
        let duration = endMinutes - startMinutes;
        if (duration < 0) {
            duration += 24 * 60; // 跨天，加24小时
        }
        
        return duration;
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

    // 读取“分钟输入框”的值（返回 number|null）
    readMinutesInput(el) {
        if (!el) return null;
        const raw = String(el.value ?? '').trim();
        if (raw === '') return null;
        const n = Number(raw);
        if (!Number.isFinite(n)) return null;
        return Math.max(0, Math.round(n));
    },

    displayCurrentDate() {
        const dateEl = document.getElementById('currentDateBtn');
        if (dateEl) {
            const date = Storage.parseDate(this.currentDate);
            const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
            const day = date.getDate();
            const weekDay = weekDays[date.getDay()];
            dateEl.textContent = `${year}年${month}月${day}日 ${weekDay}`;
        }
    },

    navigateToDate(dateStr) {
        window.location.href = `index.html?date=${dateStr}`;
    },

    shiftDay(delta) {
        const d = Storage.parseDate(this.currentDate);
        d.setDate(d.getDate() + delta);
        this.navigateToDate(Storage.formatDate(d));
    },

    async loadTasks() {
        this.tasks = await Storage.getTasksByDate(this.currentDate);
        this.sortTasks();
        this.renderTasks();
        // 任务异步加载完成后再更新总结，避免首次进入页面总结永远为 0
        this.updateSummary();
    },

    // 按计划开始时间排序
    sortTasks() {
        this.tasks.sort((a, b) => {
            const timeA = a.plannedStartTime || '';
            const timeB = b.plannedStartTime || '';
            return timeA.localeCompare(timeB);
        });
    },

    renderTasks() {
        const tbody = document.getElementById('taskTableBody');
        const cardsEl = document.getElementById('taskCards');
        if (!tbody) return;

        const isMobile = this.isMobileView();

        // 桌面端也使用卡片列表（更接近目标样式，避免 table 卡片化造成“分裂/错乱”）
        if (!isMobile && cardsEl) {
            // 表格内容清空（桌面用卡片）
            tbody.innerHTML = '';
        }

        if (this.tasks.length === 0) {
            const emptySvg = `
                <div class="task-empty-placeholder">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 150" width="320" height="150">
                      <defs>
                        <linearGradient id="clockGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" style="stop-color:#BFC6D1"/>
                          <stop offset="100%" style="stop-color:#E3E7EE"/>
                        </linearGradient>
                      </defs>
                      <circle cx="160" cy="50" r="30" fill="none" stroke="url(#clockGrad)" stroke-width="2.5"/>
                      <line x1="160" y1="50" x2="160" y2="28" stroke="#98A2B3" stroke-width="2.5" stroke-linecap="round"/>
                      <line x1="160" y1="50" x2="175" y2="50" stroke="#98A2B3" stroke-width="2.5" stroke-linecap="round"/>
                      <circle cx="160" cy="50" r="3.5" fill="#98A2B3"/>
                      <g>
                        <path d="M 185 38 Q 178 31, 172 33" fill="none" stroke="#B0B7C3" stroke-width="2" stroke-linecap="round"/>
                        <path d="M 185 38 Q 192 31, 198 33" fill="none" stroke="#B0B7C3" stroke-width="2" stroke-linecap="round"/>
                        <circle cx="185" cy="38" r="2" fill="#B0B7C3"/>
                        <animateTransform attributeName="transform" type="translate" values="0,0; 0,-3; 0,0" dur="3s" repeatCount="indefinite"/>
                      </g>
                      <text x="160" y="105" text-anchor="middle" fill="#98A2B3" font-size="13" font-family="sans-serif">暂无任务。点击右下角“+”添加任务</text>
                      <text x="160" y="125" text-anchor="middle" fill="#B0B7C3" font-size="11" font-family="sans-serif">掌控时间，享受自由</text>
                    </svg>
                </div>
            `;
            if (isMobile && cardsEl) {
                cardsEl.innerHTML = emptySvg;
                tbody.innerHTML = '';
            } else {
                if (cardsEl) {
                    cardsEl.innerHTML = emptySvg;
                    tbody.innerHTML = '';
                } else {
                    tbody.innerHTML = `<tr><td colspan="5">${emptySvg}</td></tr>`;
                }
            }
            // 重新绑定（无任务时不会有菜单，但保持一致）
            this.setupActionMenuHover();
            return;
        }

        // 统一使用卡片布局（移动端和PC端一致）
        if (cardsEl) {
            cardsEl.innerHTML = this.tasks.map((task, index) => {
                const plannedTime = task.plannedStartTime && task.plannedEndTime 
                    ? `${task.plannedStartTime}-${task.plannedEndTime}` 
                    : '';
                const actualTime = task.actualStartTime && task.actualEndTime 
                    ? `${task.actualStartTime}-${task.actualEndTime}` 
                    : '';
                
                const plannedDuration = task.plannedDuration ? this.formatDuration(task.plannedDuration) : '';
                const actualDuration = task.actualDuration ? this.formatDuration(task.actualDuration) : '';

                const completedClass = task.completed ? 'task-card--completed' : '';
            
                return `
                    <div class="task-card ${completedClass}" data-index="${index}" data-task-id="${task.id}">
                        <!-- 左滑露出：编辑/删除（仅移动端样式生效） -->
                        <div class="task-card__swipe-actions task-card__swipe-actions--left" aria-hidden="true">
                            <button class="swipe-action-btn swipe-action-btn--edit" type="button" data-action="edit">编辑</button>
                            <button class="swipe-action-btn swipe-action-btn--delete" type="button" data-action="delete">删除</button>
                        </div>
                        <div class="task-card__swipe-layer">
                            <div class="task-card__row">
                            <!-- 左侧信息区 -->
                            <div class="task-card__info">
                                <div class="task-card__header">
                                    <span class="task-card__name">${this.escapeHtml(task.name)}</span>
                                    <span class="task-card__category">${this.escapeHtml(task.category)}</span>
                                </div>
                                
                                <div class="task-card__times">
                                    <div class="task-time-row">
                                        <span class="task-time-label">计划</span>
                                        ${(plannedTime || plannedDuration) ? `
                                            <span class="task-time-val">${plannedTime}</span>
                                            ${(plannedTime && plannedDuration) ? '<span class="task-time-sep">|</span>' : ''}
                                            <span class="task-time-val">${plannedDuration}</span>
                                        ` : '<span class="task-time-val" style="color:#ccc">—</span>'}
                                    </div>
                                    
                                    <div class="task-time-row">
                                        <span class="task-time-label">实际</span>
                                        ${(actualTime || actualDuration) ? `
                                            <span class="task-time-val">${actualTime}</span>
                                            ${(actualTime && actualDuration) ? '<span class="task-time-sep">|</span>' : ''}
                                            <span class="task-time-val">${actualDuration}</span>
                                        ` : '<span class="task-time-val" style="color:#ccc">—</span>'}
                                    </div>
                                </div>
                            </div>

                            <!-- 右侧操作区 -->
                            <div class="task-card__ops">
                                <label class="task-card__check">
                                    <input type="checkbox" ${task.completed ? 'checked' : ''} 
                                           onchange="TaskList.toggleComplete(${index}, event)"
                                           data-task-index="${index}">
                                </label>
                                
                                <div class="task-actions-menu">
                                    <button class="task-menu-btn" type="button" aria-haspopup="menu" aria-label="任务操作">···</button>
                                    <div class="task-menu-dropdown" id="menu-${index}">
                                        <button class="task-menu-item" onclick="TaskList.editTask(${index})">编辑</button>
                                        <button class="task-menu-item task-menu-item-danger" onclick="TaskList.deleteTask(${index})">删除</button>
                                    </div>
                                </div>
                            </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            // 表格内容清空（统一使用卡片）
            tbody.innerHTML = '';
        }

        // 渲染完后绑定 hover 菜单（每次 renderTasks 会重建 DOM）
        this.setupActionMenuHover();
    },

    bindEvents() {
        // 用户下拉菜单
        this.setupUserDropdown();

        // 点击日期：进入二级页面（日历）
        const currentDateBtn = document.getElementById('currentDateBtn');
        if (currentDateBtn) {
            currentDateBtn.addEventListener('click', () => {
                window.location.href = 'calendar.html';
            });
        }

        // 添加任务按钮
        const addTaskBtn = document.getElementById('addTaskBtn');
        if (addTaskBtn) {
            addTaskBtn.addEventListener('click', () => this.showAddTaskModal());
        }

        // 浮动操作菜单（FAB）
        const fabToggle = document.getElementById('fabToggle');
        if (fabToggle) {
            fabToggle.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleFabMenu();
            });
        }

        // 移动端：任务卡片“···”菜单事件委托（更稳，避免某些环境 click 丢失）
        const cardsRoot = document.getElementById('taskCards');
        if (cardsRoot && !this._taskMenuDelegated) {
            this._taskMenuDelegated = true;
            const canHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
            const handler = (e) => {
                const btn = e.target && e.target.closest ? e.target.closest('.task-menu-btn') : null;
                if (!btn) return;
                const wrapper = btn.closest('.task-actions-menu');
                if (!wrapper) return;
                e.preventDefault();
                e.stopPropagation();
                const menu = wrapper.querySelector('.task-menu-dropdown');
                if (!menu) return;
                // 防止 pointerdown + click 双触发导致“闪开闪关”
                if (e.type === 'click' && this._lastMenuPointerDownAt && (Date.now() - this._lastMenuPointerDownAt) < 350) {
                    return;
                }
                if (menu.classList.contains('show')) {
                    wrapper.dataset.pinned = '0';
                    this.closeAllMenus();
                } else {
                    // 桌面端点击：钉住，避免 mouseleave 立刻关掉导致“没反应”
                    if (canHover) wrapper.dataset.pinned = '1';
                    this.openActionMenu(wrapper);
                }
            };
            // pointerdown 优先，click 兜底
            cardsRoot.addEventListener('pointerdown', (e) => {
                const btn = e.target && e.target.closest ? e.target.closest('.task-menu-btn') : null;
                if (btn) this._lastMenuPointerDownAt = Date.now();
                handler(e);
            });
            cardsRoot.addEventListener('click', handler);
        }

        // Esc 关闭浮窗及所有模态框
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                // 1. 关闭 FAB 和 下拉菜单
                this.closeFabMenu();
                this.closeAllMenus();

                // 2. 关闭所有打开的模态框
                document.querySelectorAll('.modal.show').forEach(modal => {
                    modal.classList.remove('show');
                });
                
                // 清理可能存在的编辑状态索引
                this.editingTaskIndex = null;
                this.editingActualTimeIndex = null;
            }
        });

        // 添加任务表单提交
        const addTaskForm = document.getElementById('addTaskForm');
        if (addTaskForm) {
            addTaskForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.addTask(false); // false表示保存后关闭模态框
            });
        }

        // 继续添加按钮
        const saveAndContinueBtn = document.getElementById('saveAndContinueBtn');
        if (saveAndContinueBtn) {
            saveAndContinueBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.addTask(true); // true表示保存后继续添加
            });
        }

        // 分类下拉监听
        const categorySelects = ['taskCategory', 'editTaskCategory'];
        categorySelects.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', (e) => this.handleCategoryChange(e));
                // 记录初始值
                el.addEventListener('focus', (e) => e.target.setAttribute('data-prev-value', e.target.value));
            }
        });

        // 取消添加任务
        const cancelAddTask = document.getElementById('cancelAddTask');
        if (cancelAddTask) {
            cancelAddTask.addEventListener('click', () => this.hideAddTaskModal());
        }

        // ===== 移动端快捷按钮：计划时间 =====
        const addMinutesToTime = (timeStr, minutesToAdd) => {
            if (!timeStr) return '';
            const [hStr, mStr] = String(timeStr).split(':');
            const h = parseInt(hStr, 10);
            const m = parseInt(mStr, 10);
            if (Number.isNaN(h) || Number.isNaN(m)) return '';
            const total = (h * 60 + m + minutesToAdd) % (24 * 60);
            const nh = Math.floor(total / 60);
            const nm = total % 60;
            return String(nh).padStart(2, '0') + ':' + String(nm).padStart(2, '0');
        };
        const roundTo5Min = (d) => {
            const ms = d.getTime();
            const step = 5 * 60 * 1000;
            return new Date(Math.round(ms / step) * step);
        };
        const toHHMM = (d) => {
            const hh = String(d.getHours()).padStart(2, '0');
            const mm = String(d.getMinutes()).padStart(2, '0');
            return `${hh}:${mm}`;
        };

        const quickPlanNow = document.getElementById('quickPlanNow');
        const quickPlanPlus30 = document.getElementById('quickPlanPlus30');
        const quickPlanPlus60 = document.getElementById('quickPlanPlus60');
        const plannedStartEl = document.getElementById('plannedStartTime');
        const plannedEndEl = document.getElementById('plannedEndTime');
        const plannedDurEl = document.getElementById('plannedDurationMinutes');

        const applyPlanEndOffset = (mins) => {
            if (!plannedStartEl || !plannedEndEl) return;
            const start = plannedStartEl.value;
            if (!start) return;
            plannedEndEl.value = addMinutesToTime(start, mins);
            if (plannedDurEl) plannedDurEl.dataset.manual = '0';
            this.updatePlannedDuration();
        };

        if (quickPlanNow && plannedStartEl && plannedEndEl) {
            quickPlanNow.addEventListener('click', () => {
                const now = roundTo5Min(new Date());
                const start = toHHMM(now);
                plannedStartEl.value = start;
                plannedEndEl.value = addMinutesToTime(start, 30);
                if (plannedDurEl) plannedDurEl.dataset.manual = '0';
                this.updatePlannedDuration();
            });
        }
        if (quickPlanPlus30) quickPlanPlus30.addEventListener('click', () => applyPlanEndOffset(30));
        if (quickPlanPlus60) quickPlanPlus60.addEventListener('click', () => applyPlanEndOffset(60));

        // 编辑实际时间表单提交
        const editTimeForm = document.getElementById('editTimeForm');
        if (editTimeForm) {
            editTimeForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.applyActualTimeModal(true);
            });
        }

        // “未完成任务”按钮：保存实际时间（可空）并置为未完成
        const markIncompleteBtn = document.getElementById('markIncompleteBtn');
        if (markIncompleteBtn) {
            markIncompleteBtn.addEventListener('click', () => {
                this.applyActualTimeModal(false);
            });
        }

        // 取消编辑时间
        const cancelEditTime = document.getElementById('cancelEditTime');
        if (cancelEditTime) {
            cancelEditTime.addEventListener('click', () => this.hideEditTimeModal());
        }

        // 编辑任务表单提交
        const editTaskForm = document.getElementById('editTaskForm');
        if (editTaskForm) {
            editTaskForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveTask();
            });
        }

        // 取消编辑任务
        const cancelEditTask = document.getElementById('cancelEditTask');
        if (cancelEditTask) {
            cancelEditTask.addEventListener('click', () => this.hideEditTaskModal());
        }

        // 计划时间变化时自动计算时长
        const plannedStartTime = document.getElementById('plannedStartTime');
        const plannedEndTime = document.getElementById('plannedEndTime');
        if (plannedStartTime && plannedEndTime) {
            plannedStartTime.addEventListener('change', () => this.updatePlannedDuration());
            plannedEndTime.addEventListener('change', () => this.updatePlannedDuration());
        }

        // 计划时长可手动修改：只影响保存的 plannedDuration，不反推结束时间
        const plannedDurationMinutes = document.getElementById('plannedDurationMinutes');
        if (plannedDurationMinutes) {
            plannedDurationMinutes.dataset.manual = '0';
            plannedDurationMinutes.addEventListener('input', () => {
                plannedDurationMinutes.dataset.manual = (String(plannedDurationMinutes.value || '').trim() === '') ? '0' : '1';
            });
        }

        // 编辑任务计划时间变化时自动计算时长
        const editPlannedStartTime = document.getElementById('editPlannedStartTime');
        const editPlannedEndTime = document.getElementById('editPlannedEndTime');
        if (editPlannedStartTime && editPlannedEndTime) {
            editPlannedStartTime.addEventListener('change', () => this.updateEditPlannedDuration());
            editPlannedEndTime.addEventListener('change', () => this.updateEditPlannedDuration());
        }

        // 编辑任务计划时长可手动修改（与添加任务逻辑一致）
        const editPlannedDurationMinutes = document.getElementById('editPlannedDurationMinutes');
        if (editPlannedDurationMinutes) {
            editPlannedDurationMinutes.dataset.manual = '0';
            editPlannedDurationMinutes.addEventListener('input', () => {
                editPlannedDurationMinutes.dataset.manual = (String(editPlannedDurationMinutes.value || '').trim() === '') ? '0' : '1';
            });
        }

        // 实际时间变化时自动计算时长
        const actualStartTime = document.getElementById('actualStartTime');
        const actualEndTime = document.getElementById('actualEndTime');
        if (actualStartTime && actualEndTime) {
            actualStartTime.addEventListener('change', () => this.updateActualDuration());
            actualEndTime.addEventListener('change', () => this.updateActualDuration());
        }

        // 实际时长可手动修改：只影响保存的 actualDuration，不反推结束时间
        const actualDurationMinutes = document.getElementById('actualDurationMinutes');
        if (actualDurationMinutes) {
            actualDurationMinutes.dataset.manual = '0';
            actualDurationMinutes.addEventListener('input', () => {
                actualDurationMinutes.dataset.manual = (String(actualDurationMinutes.value || '').trim() === '') ? '0' : '1';
            });
        }

        // ===== 移动端快捷按钮：实际时长 =====
        const bumpActual = (delta) => {
            const el = document.getElementById('actualDurationMinutes');
            if (!el) return;
            const curr = parseInt(String(el.value || '0'), 10);
            const next = (Number.isNaN(curr) ? 0 : curr) + delta;
            el.value = String(Math.max(0, next));
            el.dataset.manual = '1';
        };
        const quickA5 = document.getElementById('quickActualPlus5');
        const quickA10 = document.getElementById('quickActualPlus10');
        const quickA30 = document.getElementById('quickActualPlus30');
        if (quickA5) quickA5.addEventListener('click', () => bumpActual(5));
        if (quickA10) quickA10.addEventListener('click', () => bumpActual(10));
        if (quickA30) quickA30.addEventListener('click', () => bumpActual(30));

        // 模态框关闭按钮
        document.querySelectorAll('.close').forEach(closeBtn => {
            closeBtn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                if (modal) {
                    modal.classList.remove('show');
                }
            });
        });

        // 点击模态框外部关闭
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('show');
                }
            });
        });

        // ===== 移动端卡片滑动手势 =====
        this.setupMobileCardSwipe();
    },

    setupMobileCardSwipe() {
        // 仅移动端启用（避免影响 PC）
        const isMobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
        if (!isMobile) return;

        const cardsRoot = document.getElementById('taskCards');
        if (!cardsRoot) return;

        // 事件委托：只绑定一次
        if (this._mobileSwipeBound) return;
        this._mobileSwipeBound = true;

        const THRESH = 42;
        const OPEN_X = 140; // 左滑露出编辑/删除需要更大位移

        const closeAll = () => {
            cardsRoot.querySelectorAll('.task-card.is-swipe-left, .task-card.is-swipe-right').forEach(el => {
                el.classList.remove('is-swipe-left', 'is-swipe-right');
                el.style.removeProperty('--swipe-x');
                el.classList.remove('is-dragging');
            });
        };

        const closeOthers = (exceptEl) => {
            cardsRoot.querySelectorAll('.task-card.is-swipe-left, .task-card.is-swipe-right').forEach(el => {
                if (exceptEl && el === exceptEl) return;
                el.classList.remove('is-swipe-left', 'is-swipe-right');
                el.style.removeProperty('--swipe-x');
                el.classList.remove('is-dragging');
            });
        };

        const hasAnyOpen = () => !!cardsRoot.querySelector('.task-card.is-swipe-left, .task-card.is-swipe-right');

        let startX = 0;
        let startY = 0;
        let activeCard = null;
        let tracking = false;
        let pendingCloseTap = false;
        let tapTarget = null;
        let startOpenState = null; // 'left' | 'right' | null

        const getCard = (target) => target && target.closest ? target.closest('.task-card') : null;
        const isInteractive = (target) => {
            if (!target) return false;
            const tag = String(target.tagName || '').toLowerCase();
            return tag === 'input' || tag === 'button' || tag === 'select' || tag === 'textarea' || !!target.closest('button, input, select, textarea, .task-menu-dropdown');
        };

        cardsRoot.addEventListener('touchstart', (e) => {
            const t = e.touches && e.touches[0];
            if (!t) return;
            tapTarget = e.target || null;
            // iOS: 在 touchstart 里直接 closeAll() 可能导致后续 click 被吞。
            // 改为：若当前有展开态，先“候选轻点收起”，但仍允许继续进入滑动跟踪（支持反向滑动关闭）
            pendingCloseTap = false;
            if (hasAnyOpen() && !(tapTarget && tapTarget.closest && tapTarget.closest('.swipe-action-btn')) && !isInteractive(tapTarget)) {
                pendingCloseTap = true; // touchend 里根据位移判断是否真的轻点
            }

            if (isInteractive(e.target)) return;
            activeCard = getCard(e.target);
            if (!activeCard) return;
            tracking = true;
            startX = t.clientX;
            startY = t.clientY;
            startOpenState = activeCard.classList.contains('is-swipe-left')
                ? 'left'
                : (activeCard.classList.contains('is-swipe-right') ? 'right' : null);
        }, { passive: true });

        cardsRoot.addEventListener('touchmove', (e) => {
            if (!tracking || !activeCard) return;
            const t = e.touches && e.touches[0];
            if (!t) return;
            const dx = t.clientX - startX;
            const dy = t.clientY - startY;
            if (Math.abs(dy) > Math.abs(dx) + 6) return; // 主要是竖向滚动
            // 一旦开始滑动，就取消“轻点收起”候选
            if (pendingCloseTap && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) pendingCloseTap = false;
            // 轻微阻止页面跟随（让滑动更像系统手势）
            e.preventDefault();
            const clamped = Math.max(-OPEN_X, Math.min(OPEN_X, dx));
            // 更顺滑：touchmove 里只记录 dx，通过 rAF 统一更新样式
            activeCard._pendingSwipeX = clamped;
            if (!activeCard._swipeRaf) {
                activeCard._swipeRaf = requestAnimationFrame(() => {
                    if (!activeCard) return;
                    const val = activeCard._pendingSwipeX || 0;
                    activeCard.style.setProperty('--swipe-x', `${val}px`);
                    activeCard.classList.add('is-dragging');
                    activeCard._swipeRaf = null;
                });
            }
        }, { passive: false });

        cardsRoot.addEventListener('touchend', (e) => {
            // 先处理“轻点收起”（仅在未触发滑动时生效）
            if (pendingCloseTap) {
                const endX0 = (e.changedTouches && e.changedTouches[0] && e.changedTouches[0].clientX) || startX;
                const endY0 = (e.changedTouches && e.changedTouches[0] && e.changedTouches[0].clientY) || startY;
                const dx0 = endX0 - startX;
                const dy0 = endY0 - startY;
                pendingCloseTap = false;
                // 只有确实是轻点（不是滑动）才收起
                if (Math.abs(dx0) < 8 && Math.abs(dy0) < 8) {
                    closeAll();
                    tracking = false;
                    activeCard = null;
                    startOpenState = null;
                }
                return;
            }

            if (!tracking || !activeCard) return;
            const endX = (e.changedTouches && e.changedTouches[0] && e.changedTouches[0].clientX) || startX;
            const dx = endX - startX;

            activeCard.style.removeProperty('--swipe-x');
            // 结束拖动态
            activeCard.classList.remove('is-dragging');
            activeCard._pendingSwipeX = 0;

            // 新增：反向滑动可关闭
            // - 已左滑打开：右滑到阈值 => 关闭（不打开右滑动作）
            // - 已右滑打开：左滑到阈值 => 关闭（不触发记录实际弹窗）
            if (startOpenState === 'left' && dx >= THRESH) {
                closeOthers(activeCard);
                activeCard.classList.remove('is-swipe-left', 'is-swipe-right');
            } else if (startOpenState === 'right' && dx <= -THRESH) {
                closeOthers(activeCard);
                activeCard.classList.remove('is-swipe-left', 'is-swipe-right');
            } else {
                // 正常打开逻辑（未展开 or 同方向继续）
                if (dx <= -THRESH) {
                    closeOthers(activeCard);
                    activeCard.classList.add('is-swipe-left');
                } else if (dx >= THRESH) {
                    closeOthers(activeCard);
                    activeCard.classList.add('is-swipe-right');
                    // 右滑：直接进入“记录实际时间”流程（不改变任何业务逻辑，只是入口更顺手）
                    const idxStr = activeCard.getAttribute('data-index');
                    const idx = idxStr !== null ? parseInt(idxStr, 10) : NaN;
                    if (!Number.isNaN(idx)) {
                        this.showEditTimeModal(idx);
                    }
                } else {
                    // 回弹到关闭态：保持基础 transition，让动画更顺滑
                    closeOthers(activeCard);
                    activeCard.classList.remove('is-swipe-left', 'is-swipe-right');
                }
            }

            tracking = false;
            activeCard = null;
            startOpenState = null;
        }, { passive: true });

        // 左滑按钮点击（事件委托）：编辑/删除
        cardsRoot.addEventListener('click', (e) => {
            const btn = e.target && e.target.closest ? e.target.closest('.swipe-action-btn') : null;
            if (!btn) return;
            const card = getCard(btn);
            if (!card) return;
            const idxStr = card.getAttribute('data-index');
            const idx = idxStr !== null ? parseInt(idxStr, 10) : NaN;
            if (Number.isNaN(idx)) return;

            // 点击按钮后收起滑动层
            closeAll();
            const action = btn.getAttribute('data-action');
            if (action === 'edit') {
                this.editTask(idx);
            } else if (action === 'delete') {
                this.deleteTask(idx);
            }
        });

        // 点击空白处收起
        document.addEventListener('click', (e) => {
            if (!cardsRoot.contains(e.target)) return;
            const card = getCard(e.target);
            if (!card) return;
            if (e.target && e.target.closest && e.target.closest('.swipe-action-btn')) return;
            // click 作为兜底（iOS/部分浏览器 click 触发延迟/不稳定）
            if (hasAnyOpen()) closeAll();
        });
    },

    // 用户下拉菜单初始化
    setupUserDropdown() {
        const container = document.getElementById('userDropdown');
        const trigger = document.getElementById('userDropdownTrigger');
        if (!container || !trigger) return;

        // 点击触发器切换菜单
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            container.classList.toggle('active');
        });

        // 点击外部关闭菜单
        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) {
                container.classList.remove('active');
            }
        });

        // 菜单项事件
        const menuLogout = document.getElementById('menuLogout');
        if (menuLogout) {
            menuLogout.addEventListener('click', () => {
                if (confirm('确定要退出登录吗？')) {
                    Auth.logout();
                }
            });
        }

        const menuInstall = document.getElementById('menuInstall');
        if (menuInstall) {
            menuInstall.addEventListener('click', () => {
                // 触发 PWA 安装
                if (window.deferredPrompt) {
                    window.deferredPrompt.prompt();
                } else {
                    alert('请使用浏览器菜单中的"添加到主屏幕"或"安装应用"选项');
                }
                container.classList.remove('active');
            });
        }

        const menuEditProfile = document.getElementById('menuEditProfile');
        if (menuEditProfile) {
            menuEditProfile.addEventListener('click', () => {
                const modal = document.getElementById('editProfileModal');
                if (modal) {
                    const input = document.getElementById('newNicknameInput');
                    if (input) {
                        const userInfo = Auth.getUserInfo();
                        input.value = userInfo?.nickname || '';
                    }
                    modal.classList.add('show');
                }
                container.classList.remove('active');
            });
        }

        // 确认修改昵称
        const confirmEditProfileBtn = document.getElementById('confirmEditProfileBtn');
        if (confirmEditProfileBtn) {
            confirmEditProfileBtn.addEventListener('click', async () => {
                const input = document.getElementById('newNicknameInput');
                const newNickname = input?.value?.trim();
                if (!newNickname) {
                    alert('请输入昵称');
                    return;
                }
                
                const originalText = confirmEditProfileBtn.textContent;
                confirmEditProfileBtn.disabled = true;
                confirmEditProfileBtn.textContent = '保存中...';
                
                try {
                    await Auth.updateProfile({ nickname: newNickname });
                    const nicknameEl = document.getElementById('userNickname');
                    if (nicknameEl) nicknameEl.textContent = newNickname;
                    document.getElementById('editProfileModal')?.classList.remove('show');
                    alert('昵称修改成功');
                } catch (err) {
                    alert('修改失败：' + (err.message || err));
                } finally {
                    confirmEditProfileBtn.disabled = false;
                    confirmEditProfileBtn.textContent = originalText;
                }
            });
        }

        // 修改密码
        const menuChangePwd = document.getElementById('menuChangePwd');
        if (menuChangePwd) {
            menuChangePwd.addEventListener('click', () => {
                const modal = document.getElementById('changePwdModal');
                if (modal) {
                    const input = document.getElementById('newPassword');
                    if (input) input.value = '';
                    modal.classList.add('show');
                }
                container.classList.remove('active');
            });
        }

        // 确认修改密码
        const confirmChangePwdBtn = document.getElementById('confirmChangePwdBtn');
        if (confirmChangePwdBtn) {
            confirmChangePwdBtn.addEventListener('click', async () => {
                const input = document.getElementById('newPassword');
                const newPassword = input?.value?.trim();
                if (!newPassword) {
                    alert('请输入新密码');
                    return;
                }
                if (newPassword.length < 6 || !/\d/.test(newPassword) || !/[a-zA-Z]/.test(newPassword)) {
                    alert('密码需包含数字和字母，至少6位');
                    return;
                }
                
                const originalText = confirmChangePwdBtn.textContent;
                confirmChangePwdBtn.disabled = true;
                confirmChangePwdBtn.textContent = '修改中...';
                
                try {
                    await Auth.changePassword(newPassword);
                    document.getElementById('changePwdModal')?.classList.remove('show');
                    alert('密码修改成功');
                } catch (err) {
                    alert('修改失败：' + (err.message || err));
                } finally {
                    confirmChangePwdBtn.disabled = false;
                    confirmChangePwdBtn.textContent = originalText;
                }
            });
        }

        // 关闭修改密码模态框
        const changePwdModal = document.getElementById('changePwdModal');
        if (changePwdModal) {
            const closeBtn = changePwdModal.querySelector('.close');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    changePwdModal.classList.remove('show');
                });
            }
        }
    },

    toggleFabMenu() {
        const menu = document.getElementById('fabMenu');
        const toggle = document.getElementById('fabToggle');
        if (!menu || !toggle) return;

        this.fabOpen = !this.fabOpen;
        if (this.fabOpen) {
            menu.hidden = false;
            toggle.setAttribute('aria-expanded', 'true');
            toggle.classList.add('is-open');
        } else {
            menu.hidden = true;
            toggle.setAttribute('aria-expanded', 'false');
            toggle.classList.remove('is-open');
        }
    },

    closeFabMenu() {
        if (!this.fabOpen) return;
        const menu = document.getElementById('fabMenu');
        const toggle = document.getElementById('fabToggle');
        if (menu) menu.hidden = true;
        if (toggle) {
            toggle.setAttribute('aria-expanded', 'false');
            toggle.classList.remove('is-open');
        }
        this.fabOpen = false;
    },

    showAddTaskModal() {
        const modal = document.getElementById('addTaskModal');
        if (modal) {
            document.getElementById('addTaskForm').reset();
            const dur = document.getElementById('plannedDurationMinutes');
            if (dur) {
                dur.value = '';
                dur.dataset.manual = '0';
            }
            modal.classList.add('show');
        }
    },

    // 显示添加任务成功提示
    showAddTaskToast() {
        const toast = document.getElementById('addTaskToast');
        if (!toast) return;

        // 清除之前的定时器
        if (this._toastTimer) {
            clearTimeout(this._toastTimer);
        }

        // 飘入显示
        toast.style.transform = 'translateY(0)';
        toast.style.opacity = '1';

        // 2秒后开始渐隐飘出
        this._toastTimer = setTimeout(() => {
            toast.style.opacity = '0';
            // 延迟一点再移出，让渐隐效果更明显
            setTimeout(() => {
                toast.style.transform = 'translateY(-100%)';
            }, 200);
        }, 2000);
    },

    hideAddTaskModal() {
        const modal = document.getElementById('addTaskModal');
        if (modal) {
            modal.classList.remove('show');
        }
    },

    updatePlannedDuration() {
        const startTime = document.getElementById('plannedStartTime').value;
        const endTime = document.getElementById('plannedEndTime').value;
        const durationInput = document.getElementById('plannedDurationMinutes');
        const manual = durationInput && durationInput.dataset.manual === '1';
        
        if (startTime && endTime) {
            const duration = this.calculateDuration(startTime, endTime);
            // 仅在“未手动修改时长”时，用时间差刷新默认时长
            if (durationInput && !manual) durationInput.value = duration > 0 ? String(duration) : '';
        } else {
            if (durationInput && !manual) durationInput.value = '';
        }
    },

    updateEditPlannedDuration() {
        const startTime = document.getElementById('editPlannedStartTime').value;
        const endTime = document.getElementById('editPlannedEndTime').value;
        const durationInput = document.getElementById('editPlannedDurationMinutes');
        const manual = durationInput && durationInput.dataset.manual === '1';
        
        if (startTime && endTime) {
            const duration = this.calculateDuration(startTime, endTime);
            // 仅在"未手动修改时长"时，用时间差刷新默认时长
            if (durationInput && !manual) durationInput.value = duration > 0 ? String(duration) : '';
        } else {
            if (durationInput && !manual) durationInput.value = '';
        }
    },

    updateActualDuration() {
        const startTime = document.getElementById('actualStartTime').value;
        const endTime = document.getElementById('actualEndTime').value;
        const durationInput = document.getElementById('actualDurationMinutes');
        const manual = durationInput && durationInput.dataset.manual === '1';
        
        if (startTime && endTime) {
            const duration = this.calculateDuration(startTime, endTime);
            if (durationInput && !manual) durationInput.value = duration > 0 ? String(duration) : '';
        } else {
            if (durationInput && !manual) durationInput.value = '';
        }
    },

    async addTask(continueAdding = false) {
        const btn = document.querySelector('#addTaskForm button[type="submit"]');
        const originalBtnText = btn ? btn.textContent : '保存';
        if (btn) {
            btn.disabled = true;
            btn.textContent = '保存中...';
        }

        try {
            const category = document.getElementById('taskCategory').value;
            const name = document.getElementById('taskName').value.trim();
            const plannedStartTime = document.getElementById('plannedStartTime').value;
            const plannedEndTime = document.getElementById('plannedEndTime').value;
            const plannedDurationInput = document.getElementById('plannedDurationMinutes');
    
            if (!name) {
                alert('请输入任务名称');
                return;
            }
    
            if (!plannedStartTime || !plannedEndTime) {
                alert('请选择计划开始和结束时间');
                return;
            }
    
            // 默认：用开始-结束计算；允许手动改时长（不反推结束时间）
            const computedPlanned = this.calculateDuration(plannedStartTime, plannedEndTime);
            const manualPlanned = this.readMinutesInput(plannedDurationInput);
            const plannedDuration = manualPlanned !== null ? manualPlanned : computedPlanned;
    
            if (plannedDuration <= 0) {
                alert('计划结束时间必须晚于开始时间');
                return;
            }
    
            const task = {
                id: Date.now(),
                category: category,
                name: name,
                plannedDuration: plannedDuration,
                plannedStartTime: plannedStartTime,
                plannedEndTime: plannedEndTime,
                actualDuration: null,
                actualStartTime: null,
                actualEndTime: null,
                completed: false
            };
    
            this.tasks.push(task);
            this.sortTasks();
            await this.saveTasks();
            this.renderTasks();
            this.updateSummary();
    
            // 显示添加成功提示
            this.showAddTaskToast();
    
            // 恢复稳定逻辑：
            // - continueAdding === true：留在弹窗，便于继续添加
            //   需求：开始时间=上个任务的结束时间；结束时间=开始时间+30分钟
            // - continueAdding === false：关闭弹窗
            if (continueAdding) {
                const nameEl = document.getElementById('taskName');
                if (nameEl) {
                    nameEl.value = '';
                    nameEl.focus();
                }

                // 仅修复“继续添加任务”的时间默认逻辑：不影响其它任何逻辑
                const startEl = document.getElementById('plannedStartTime');
                const endEl = document.getElementById('plannedEndTime');
                const durEl = document.getElementById('plannedDurationMinutes');
                const addMinutesToTime = (timeStr, minutesToAdd) => {
                    if (!timeStr) return '';
                    const [hStr, mStr] = String(timeStr).split(':');
                    const h = parseInt(hStr, 10);
                    const m = parseInt(mStr, 10);
                    if (Number.isNaN(h) || Number.isNaN(m)) return '';
                    const total = (h * 60 + m + minutesToAdd) % (24 * 60);
                    const nh = Math.floor(total / 60);
                    const nm = total % 60;
                    return String(nh).padStart(2, '0') + ':' + String(nm).padStart(2, '0');
                };

                if (startEl && endEl && plannedEndTime) {
                    const nextStart = plannedEndTime;
                    const nextEnd = addMinutesToTime(nextStart, 30);
                    startEl.value = nextStart;
                    endEl.value = nextEnd;
                    // 将时长恢复为自动计算状态，并刷新为 30
                    if (durEl) durEl.dataset.manual = '0';
                    this.updatePlannedDuration();
                }
            } else {
                this.hideAddTaskModal();
            }
        } catch (error) {
            console.error('添加任务失败:', error);
            alert('添加任务失败，请重试');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = originalBtnText;
            }
        }
    },

    showEditTaskModal(index) {
        const modal = document.getElementById('editTaskModal');
        if (modal) {
            this.editingTaskIndex = index;
            const task = this.tasks[index];
            
            document.getElementById('editTaskCategory').value = task.category;
            document.getElementById('editTaskName').value = task.name;
            document.getElementById('editPlannedStartTime').value = task.plannedStartTime || '';
            document.getElementById('editPlannedEndTime').value = task.plannedEndTime || '';
            
            // 填充时长并重置手动标记
            const durationInput = document.getElementById('editPlannedDurationMinutes');
            if (durationInput) {
                durationInput.value = task.plannedDuration ? String(task.plannedDuration) : '';
                durationInput.dataset.manual = '0'; // 初始为非手动状态
            }
            
            modal.classList.add('show');
        }
    },

    hideEditTaskModal() {
        const modal = document.getElementById('editTaskModal');
        if (modal) {
            modal.classList.remove('show');
            this.editingTaskIndex = null;
        }
    },

    editTask(index) {
        this.closeAllMenus();
        this.showEditTaskModal(index);
    },

    async saveTask() {
        if (this.editingTaskIndex === null) return;

        const btn = document.querySelector('#editTaskForm button[type="submit"]');
        const originalBtnText = btn ? btn.textContent : '保存';
        if (btn) {
            btn.disabled = true;
            btn.textContent = '保存中...';
        }

        try {
            const category = document.getElementById('editTaskCategory').value;
            const name = document.getElementById('editTaskName').value.trim();
            const plannedStartTime = document.getElementById('editPlannedStartTime').value;
            const plannedEndTime = document.getElementById('editPlannedEndTime').value;
            const plannedDurationInput = document.getElementById('editPlannedDurationMinutes');
    
            if (!name) {
                alert('请输入任务名称');
                return;
            }
    
            if (!plannedStartTime || !plannedEndTime) {
                alert('请选择计划开始和结束时间');
                return;
            }
    
            // 默认：用开始-结束计算；允许手动改时长（与添加任务逻辑一致）
            const computedPlanned = this.calculateDuration(plannedStartTime, plannedEndTime);
            const manualPlanned = this.readMinutesInput(plannedDurationInput);
            const plannedDuration = manualPlanned !== null ? manualPlanned : computedPlanned;
    
            if (plannedDuration <= 0) {
                alert('计划结束时间必须晚于开始时间');
                return;
            }
    
            const task = this.tasks[this.editingTaskIndex];
            task.category = category;
            task.name = name;
            task.plannedStartTime = plannedStartTime;
            task.plannedEndTime = plannedEndTime;
            task.plannedDuration = plannedDuration;
    
            this.sortTasks();
            await this.saveTasks();
            this.renderTasks();
            this.updateSummary();
            this.hideEditTaskModal();
        } catch (error) {
            console.error('保存任务失败:', error);
            alert('保存任务失败，请重试');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = originalBtnText;
            }
        }
    },

    showEditTimeModal(index) {
        const modal = document.getElementById('editTimeModal');
        if (modal) {
            this.editingActualTimeIndex = index;
            const task = this.tasks[index];
            
            // 如果已有实际时间，使用实际时间；否则使用计划时间作为默认值
            document.getElementById('actualStartTime').value = task.actualStartTime || task.plannedStartTime || '';
            document.getElementById('actualEndTime').value = task.actualEndTime || task.plannedEndTime || '';
            const durInput = document.getElementById('actualDurationMinutes');
            if (durInput) {
                // 优先级：已有实际时长 > 计划时长 > 从时间计算
                if (task.actualDuration !== null && task.actualDuration !== undefined && task.actualDuration !== '') {
                    durInput.value = String(task.actualDuration);
                } else if (task.plannedDuration) {
                    // 默认取计划时长
                    durInput.value = String(task.plannedDuration);
                } else {
                    durInput.value = '';
                }
                durInput.dataset.manual = '0'; // 初始为非手动状态
            }
            
            modal.classList.add('show');
        }
    },

    hideEditTimeModal() {
        const modal = document.getElementById('editTimeModal');
        if (modal) {
            modal.classList.remove('show');
            this.editingActualTimeIndex = null;
        }
    },

    editActualTime(index) {
        this.closeAllMenus();
        this.showEditTimeModal(index);
    },

    // 统一：从"记录实际时间"弹窗里，选择"完成任务 / 未完成任务"
    async applyActualTimeModal(completed) {
        if (this.editingActualTimeIndex === null) return;

        const btn = document.querySelector('#editTimeForm button[type="submit"]');
        const incompleteBtn = document.getElementById('markIncompleteBtn');
        const originalBtnText = btn ? btn.textContent : '完成任务';
        const originalIncompleteText = incompleteBtn ? incompleteBtn.textContent : '未完成任务';
        
        if (btn) { btn.disabled = true; btn.textContent = '保存中...'; }
        if (incompleteBtn) { incompleteBtn.disabled = true; incompleteBtn.textContent = '处理中...'; }

        try {
            const task = this.tasks[this.editingActualTimeIndex];
    
            // 逻辑修正：仅在点击"完成任务"时读取并保存实际时间；
            // 点击"未完成任务"时，直接清除实际时间数据。
            if (completed) {
                const actualStartTime = document.getElementById('actualStartTime').value;
                const actualEndTime = document.getElementById('actualEndTime').value;
                const actualDurationInput = document.getElementById('actualDurationMinutes');
    
                // 默认：用开始-结束计算；允许手动改时长（不反推结束时间）
                const computedActual = (actualStartTime && actualEndTime) ? this.calculateDuration(actualStartTime, actualEndTime) : null;
                const manualActual = this.readMinutesInput(actualDurationInput);
                const actualDuration = manualActual !== null ? manualActual : computedActual;
    
                if (actualStartTime && actualEndTime && computedActual !== null && computedActual <= 0) {
                        alert('实际结束时间必须晚于开始时间');
                        return;
                }
    
                task.actualDuration = (actualDuration !== null && actualDuration !== undefined) ? actualDuration : null;
                task.actualStartTime = actualStartTime || null;
                task.actualEndTime = actualEndTime || null;
            } else {
                task.actualDuration = null;
                task.actualStartTime = null;
                task.actualEndTime = null;
            }
    
            const wasCompleted = task.completed;
            task.completed = !!completed;
    
            await this.saveTasks();
            this.renderTasks();
            this.updateSummary();
            this.hideEditTimeModal();
    
            if (!wasCompleted && task.completed) {
                setTimeout(() => this.celebrateCompletion(task.id), 120);
            }
        } catch (error) {
            console.error('保存实际时间失败:', error);
            alert('保存失败，请重试');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = originalBtnText; }
            if (incompleteBtn) { incompleteBtn.disabled = false; incompleteBtn.textContent = originalIncompleteText; }
        }
    },

    async toggleComplete(index, event) {
        const task = this.tasks[index];
        if (!task) return;

        // 新逻辑：无论当前是否完成，点击复选框都只打开弹窗；
        // 状态变更仅通过弹窗内“完成任务/未完成任务”按钮完成。
        if (event && event.target) {
            // 将 UI 还原为“当前状态”（阻止点击瞬间直接切换）
            event.target.checked = !!task.completed;
        }

        this.showEditTimeModal(index);
    },

    // 兼容：旧绑定仍可能调用 saveActualTime（等价于“完成任务”）
    saveActualTime() {
        return this.applyActualTimeModal(true);
    },

    celebrateCompletion(taskId) {
        const row =
            document.querySelector(`.task-grid-row[data-task-id="${taskId}"]`) ||
            document.querySelector(`.task-card[data-task-id="${taskId}"]`) ||
            document.querySelector(`#taskTableBody tr[data-task-id="${taskId}"]`);
        if (!row) return;

        const checkbox = row.querySelector('input[type="checkbox"]');
        if (!checkbox) return;
        
        // 确保复选框位置已更新
        requestAnimationFrame(() => {
            const rect = checkbox.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            
            // 添加行庆祝动画类
            row.classList.add('celebrating');
            setTimeout(() => {
                row.classList.remove('celebrating');
            }, 600);
            
            // 创建庆祝粒子
            const container = document.createElement('div');
            container.className = 'task-completed-celebration';
            container.style.position = 'fixed';
            container.style.left = centerX + 'px';
            container.style.top = centerY + 'px';
            container.style.width = '0';
            container.style.height = '0';
            container.style.zIndex = '10000';
            container.style.pointerEvents = 'none';
            document.body.appendChild(container);
            
            // 创建8个粒子，形成更丰富的效果
            const particleCount = 8;
            for (let i = 0; i < particleCount; i++) {
                const particle = document.createElement('div');
                particle.className = 'celebration-particle';
                const angle = (i * 360 / particleCount - 90) * (Math.PI / 180);
                const distance = 40 + Math.random() * 20; // 随机距离增加自然感
                const tx = Math.cos(angle) * distance;
                const ty = Math.sin(angle) * distance;
                particle.style.setProperty('--tx', tx + 'px');
                particle.style.setProperty('--ty', ty + 'px');
                
                // 随机大小
                const size = 6 + Math.random() * 4;
                particle.style.width = size + 'px';
                particle.style.height = size + 'px';
                
                // 随机延迟
                particle.style.animationDelay = (i * 0.05) + 's';
                
                container.appendChild(particle);
            }
            
            // 清理动画元素
            setTimeout(() => {
                if (container.parentNode) {
                    container.parentNode.removeChild(container);
                }
            }, 1000);
        });
    },

    async deleteTask(index) {
        this.closeAllMenus();
        if (confirm('确定要删除这个任务吗？')) {
            this.tasks.splice(index, 1);
            await this.saveTasks();
            this.renderTasks();
            this.updateSummary();
        }
    },

    async saveTasks() {
        await Storage.saveTasksByDate(this.currentDate, this.tasks);
    },

    updateSummary() {
        const summaryEl = document.getElementById('summaryText');
        const summaryContainer = document.getElementById('summary');
        if (!summaryEl) return;

        // 分类来源：优先使用服务端分类（Category.list），并补齐任务里存在但分类表里没有的旧分类
        const baseCats = (Category && Array.isArray(Category.list) ? Category.list.map(c => c.name) : [])
            .filter(Boolean);
        const fallbackCats = ['工作', '事业', '陪家人', '其它'];
        const orderedCats = (baseCats.length > 0 ? baseCats : fallbackCats).slice();

        const stats = {};
        orderedCats.forEach(c => { stats[c] = 0; });

        this.tasks.forEach(task => {
            // 修正：仅统计已完成任务的实际时长
            if (!task.completed) return;

            const actual = parseFloat(task.actualDuration);
            // 如果实际时长无效，则不计入（或可视情况视为0）
            const duration = !isNaN(actual) ? actual : 0;

            const cat = task.category || '未分类';
            if (!Object.prototype.hasOwnProperty.call(stats, cat)) {
                stats[cat] = 0;
                orderedCats.push(cat);
            }
            stats[cat] += duration;
        });

        const total = Object.values(stats).reduce((sum, val) => sum + val, 0);
        // 只展示有值的分类（避免分类很多时过长）；若全部为0，则展示前4个分类
        const nonZero = orderedCats.filter(c => (stats[c] || 0) > 0);
        const showCats = (nonZero.length > 0 ? nonZero : orderedCats.slice(0, 4));
        const parts = showCats.map(c => `${c}${this.formatDuration(stats[c] || 0)}`);
        const summaryText = `${parts.join('、')}; 总共${this.formatDuration(total)}`;
        summaryEl.textContent = summaryText;

        // 添加/更新查看详情入口
        let linkBtn = document.getElementById('viewSummaryBtn');
        if (!linkBtn) {
            linkBtn = document.createElement('button');
            linkBtn.id = 'viewSummaryBtn';
            linkBtn.className = 'btn-secondary btn-small';
            linkBtn.style.marginTop = '12px';
            linkBtn.textContent = '查看更多';
            linkBtn.onclick = () => {
                window.location.href = 'summary.html';
            };
            summaryContainer.appendChild(linkBtn);
        }
    },

    // 应用任务列表（用于模板功能）
    async applyTasks(tasks) {
        // 为每个任务生成新的ID，并重新计算计划时长（兼容旧模板）
        this.tasks = tasks.map(task => {
            // 如果模板中没有计划时长，根据开始和结束时间计算
            let plannedDuration = task.plannedDuration;
            if (!plannedDuration && task.plannedStartTime && task.plannedEndTime) {
                plannedDuration = this.calculateDuration(task.plannedStartTime, task.plannedEndTime);
            }
            
            return {
                ...task,
                id: Date.now() + Math.random(),
                plannedDuration: plannedDuration || 0,
                actualDuration: null,
                actualStartTime: null,
                actualEndTime: null,
                completed: false
            };
        });
        this.sortTasks();
        await this.saveTasks();
        this.renderTasks();
        this.updateSummary();
    },

    // 获取当前任务列表（用于模板功能）
    getTasks() {
        return this.tasks;
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    setupActionMenuHover() {
        const canHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

        // hover/点击 菜单：使用 JS 控制 fixed 定位，避免移入闪退/层级透出
        document.querySelectorAll('.task-actions-menu').forEach(wrapper => {
            if (wrapper.dataset.hoverBound === '1') return;
            wrapper.dataset.hoverBound = '1';

            const btn = wrapper.querySelector('.task-menu-btn');

            if (canHover) {
                wrapper.addEventListener('mouseenter', () => {
                    // 若被“点击钉住”，mouseenter 不重复打开/重定位
                    if (wrapper.dataset.pinned === '1') return;
                    this.openActionMenu(wrapper);
                });

                wrapper.addEventListener('mouseleave', (e) => {
                    this.scheduleCloseActionMenu(e);
                });

                // 桌面端：点击也可打开/关闭（并“钉住”菜单，鼠标移走不自动关闭）
                if (btn) {
                    btn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const menu = wrapper.querySelector('.task-menu-dropdown');
                        if (!menu) return;

                        // 已打开且已钉住：再次点击关闭
                        if (menu.classList.contains('show') && wrapper.dataset.pinned === '1') {
                            wrapper.dataset.pinned = '0';
                            this.closeAllMenus();
                            return;
                        }

                        // 打开并钉住
                        wrapper.dataset.pinned = '1';
                        this.openActionMenu(wrapper);
                    });
                }
            } else if (btn) {
                // 移动端/触屏：用 pointerdown 更稳（部分 iOS 环境 click 容易丢）
                const handler = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const menu = wrapper.querySelector('.task-menu-dropdown');
                    if (!menu) return;
                    if (menu.classList.contains('show')) {
                        this.closeAllMenus();
                    } else {
                        this.openActionMenu(wrapper);
                    }
                };
                btn.addEventListener('pointerdown', handler);
                // 兜底：少数环境不支持 pointerdown
                btn.addEventListener('click', handler);
            }

            const menu = wrapper.querySelector('.task-menu-dropdown');
            if (menu) {
                menu.addEventListener('mouseenter', () => this.cancelCloseActionMenu());
                menu.addEventListener('mouseleave', (e) => this.scheduleCloseActionMenu(e));
            }
        });
    },

    openActionMenu(wrapper) {
        const menu = wrapper.querySelector('.task-menu-dropdown');
        const btn = wrapper.querySelector('.task-menu-btn');
        if (!menu || !btn) return;

        this.cancelCloseActionMenu();

        // 先关闭其他菜单，保证只开一个
        this.closeAllMenus();

        // 菜单打开时：提升所在行/卡片的层级，避免被其它任务行压住（尤其是完成态）
        const host = wrapper.closest('.task-grid-row') || wrapper.closest('.task-card') || wrapper.closest('tr');
        if (host) {
            host.classList.add('menu-open');
            this._openActionMenuHost = host;
        }

        // 打开并切换为 fixed 定位（避免被容器的 stacking context 影响）
        // 重要：移动端卡片存在 transform/overflow，会导致 fixed 在 iOS 下定位异常。
        // 解决：把菜单临时移动到 body（portal），再用 viewport 坐标定位。
        const shouldPortal =
            (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
            (window.matchMedia && window.matchMedia('(max-width: 768px)').matches);

        if (shouldPortal && !menu.__portalized) {
            // 用占位节点记录原位置，关闭时归位
            const placeholder = document.createComment('task-menu-placeholder');
            menu.__portalPlaceholder = placeholder;
            menu.__portalOriginParent = menu.parentNode;
            menu.__portalNextSibling = menu.nextSibling;
            menu.parentNode.insertBefore(placeholder, menu);

            const portalHost = document.createElement('div');
            portalHost.className = 'task-menu-portal';
            portalHost.style.position = 'fixed';
            portalHost.style.left = '0';
            portalHost.style.top = '0';
            portalHost.style.width = '0';
            portalHost.style.height = '0';
            portalHost.style.zIndex = '100000';
            document.body.appendChild(portalHost);

            menu.__portalHost = portalHost;
            portalHost.appendChild(menu);
            menu.__portalized = true;
        }

        menu.classList.add('show', 'is-fixed');

        // 先让它可见以便测量宽度
        menu.style.left = '0px';
        menu.style.top = '0px';

        const btnRect = btn.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();

        // 菜单尽量贴近按钮：默认在按钮下方；空间不足则翻转到上方
        const gap = 0;
        const padding = 8;

        let topBelow = Math.round(btnRect.bottom - gap);
        let topAbove = Math.round(btnRect.top - menuRect.height + gap);

        // 右对齐按钮；如果左侧空间不足则改为左对齐
        let leftRightAligned = Math.round(btnRect.right - menuRect.width);
        let leftLeftAligned = Math.round(btnRect.left);

        const maxLeft = window.innerWidth - menuRect.width - padding;
        const maxTop = window.innerHeight - menuRect.height - padding;

        // 选择上下位置（优先下方）
        let top = topBelow;
        if (topBelow > maxTop && topAbove >= padding) {
            top = topAbove;
        }

        // 选择左右位置（优先右对齐）
        let left = leftRightAligned;
        if (left < padding && leftLeftAligned <= maxLeft) {
            left = leftLeftAligned;
        }

        left = Math.max(padding, Math.min(left, maxLeft));
        top = Math.max(padding, Math.min(top, maxTop));

        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;

        this._openActionMenuEl = menu;
        this._openActionMenuWrapper = wrapper;
    },

    cancelCloseActionMenu() {
        if (this._closeActionMenuTimer) {
            clearTimeout(this._closeActionMenuTimer);
            this._closeActionMenuTimer = null;
        }
    },

    scheduleCloseActionMenu(e) {
        // 给一点延迟，避免从按钮移动到菜单过程中闪退
        this.cancelCloseActionMenu();
        this._closeActionMenuTimer = setTimeout(() => {
            // 桌面端“点击钉住”时不自动关闭
            if (this._openActionMenuWrapper && this._openActionMenuWrapper.dataset.pinned === '1') {
                return;
            }
            // 如果鼠标已经进入菜单或 wrapper，不关闭
            const active = document.activeElement;
            if (this._openActionMenuWrapper) {
                const hovered = this._openActionMenuWrapper.matches(':hover') ||
                    (this._openActionMenuEl && this._openActionMenuEl.matches(':hover')) ||
                    (active && this._openActionMenuWrapper.contains(active));
                if (hovered) return;
            }
            this.closeAllMenus();
        }, 260);
    },

    // 关闭所有菜单
    closeAllMenus() {
        // 清理“钉住”状态
        document.querySelectorAll('.task-actions-menu[data-pinned="1"]').forEach(w => {
            w.dataset.pinned = '0';
        });

        document.querySelectorAll('.task-menu-dropdown').forEach(menu => {
            // 如果菜单被 portal 到 body，先归位
            if (menu.__portalized) {
                try {
                    const placeholder = menu.__portalPlaceholder;
                    const originParent = menu.__portalOriginParent;
                    const nextSibling = menu.__portalNextSibling;
                    const host = menu.__portalHost;

                    if (originParent) {
                        if (nextSibling && nextSibling.parentNode === originParent) {
                            originParent.insertBefore(menu, nextSibling);
                        } else if (placeholder && placeholder.parentNode === originParent) {
                            originParent.insertBefore(menu, placeholder);
                        } else {
                            originParent.appendChild(menu);
                        }
                    }
                    if (placeholder && placeholder.parentNode) placeholder.parentNode.removeChild(placeholder);
                    if (host && host.parentNode) host.parentNode.removeChild(host);
                } catch (e) {
                    // ignore
                }
                menu.__portalized = false;
                menu.__portalPlaceholder = null;
                menu.__portalOriginParent = null;
                menu.__portalNextSibling = null;
                menu.__portalHost = null;
            }

            menu.classList.remove('show', 'is-fixed');
            // 清理 fixed 定位的 inline 样式
            menu.style.left = '';
            menu.style.top = '';
        });
        if (this._openActionMenuHost) {
            this._openActionMenuHost.classList.remove('menu-open');
            this._openActionMenuHost = null;
        }
        this._openActionMenuEl = null;
        this._openActionMenuWrapper = null;
    },

    // 切换菜单显示/隐藏
    toggleMenu(event, index) {
        // 旧的点击打开逻辑已废弃：桌面端仅 hover 显示
        if (event) event.preventDefault();
    }
};

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', async () => {
    // 检查登录状态
    if (!Auth.requireAuth()) {
        return;
    }
    await TaskList.init();
});


// 显式挂载到 window 对象，供其他模块调用
window.TaskList = TaskList;
