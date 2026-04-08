// 日历组件
const Calendar = {
    currentDate: new Date(),
    weekDays: ['日', '一', '二', '三', '四', '五', '六'],

    async init() {
        await this.render();
        this.bindEvents();
    },

    async render() {
        const calendarEl = document.getElementById('calendar');
        const monthYearEl = document.getElementById('currentMonthYear');
        
        if (!calendarEl || !monthYearEl) return;

        // 更新月份年份显示
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth() + 1;
        monthYearEl.textContent = `${year}年${month}月`;

        // 创建日历网格
        let html = '<div class="calendar-grid">';
        
        // 添加星期标题
        this.weekDays.forEach(day => {
            html += `<div class="calendar-day-header">${day}</div>`;
        });

        // 获取当月第一天和最后一天
        const firstDay = new Date(year, month - 1, 1);
        const lastDay = new Date(year, month, 0);
        const firstDayWeek = firstDay.getDay();
        const daysInMonth = lastDay.getDate();

        // 获取上个月的最后几天
        const prevMonthLastDay = new Date(year, month - 1, 0).getDate();
        
        // 填充上个月的日期
        for (let i = firstDayWeek - 1; i >= 0; i--) {
            const day = prevMonthLastDay - i;
            html += await this.createDayElement(year, month - 2, day, true);
        }

        // 填充当月的日期
        const today = new Date();
        const todayStr = Storage.formatDate(today);
        
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = Storage.formatDate(new Date(year, month - 1, day));
            const isToday = dateStr === todayStr;
            html += await this.createDayElement(year, month - 1, day, false, isToday, dateStr);
        }

        // 填充下个月的日期（补齐42个格子）
        const totalCells = 42;
        const filledCells = firstDayWeek + daysInMonth;
        const remainingCells = totalCells - filledCells;
        
        for (let day = 1; day <= remainingCells; day++) {
            html += await this.createDayElement(year, month, day, true);
        }

        html += '</div>';
        calendarEl.innerHTML = html;
    },

    async createDayElement(year, month, day, isOtherMonth, isToday = false, dateStr = null) {
        const date = new Date(year, month, day);
        const dateStrFormatted = dateStr || Storage.formatDate(date);
        const tasks = await Storage.getTasksByDate(dateStrFormatted);
        const hasTasks = tasks && tasks.length > 0;
        const completedTasks = tasks ? tasks.filter(t => t.completed).length : 0;
        
        let classes = 'calendar-day';
        if (isOtherMonth) classes += ' other-month';
        if (isToday) classes += ' today';
        if (hasTasks) classes += ' has-tasks';

        let tasksIndicator = '';
        if (hasTasks) {
            tasksIndicator = `<div class="calendar-day-tasks">${completedTasks}/${tasks.length}</div>`;
        }

        return `
            <div class="${classes}" data-date="${dateStrFormatted}">
                <div class="calendar-day-number">${day}</div>
                ${tasksIndicator}
            </div>
        `;
    },

    bindEvents() {
        // 上一个月按钮
        const prevBtn = document.getElementById('prevMonth');
        if (prevBtn) {
            prevBtn.addEventListener('click', async () => {
                this.currentDate.setMonth(this.currentDate.getMonth() - 1);
                await this.render();
            });
        }

        // 下一个月按钮
        const nextBtn = document.getElementById('nextMonth');
        if (nextBtn) {
            nextBtn.addEventListener('click', async () => {
                this.currentDate.setMonth(this.currentDate.getMonth() + 1);
                await this.render();
            });
        }

        // 日期点击事件
        document.addEventListener('click', (e) => {
            const dayEl = e.target.closest('.calendar-day');
            if (dayEl && !dayEl.classList.contains('other-month')) {
                const dateStr = dayEl.getAttribute('data-date');
                if (dateStr) {
                    // 跳转到任务页面（首页）
                    window.location.href = `index.html?date=${dateStr}`;
                }
            }
        });
    }
};

// 页面加载时初始化日历
document.addEventListener('DOMContentLoaded', async () => {
    // 检查登录状态
    if (!Auth.requireAuth()) {
        return;
    }
    await Calendar.init();
});

