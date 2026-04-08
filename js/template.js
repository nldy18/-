// 模板管理功能
const Template = {
    init() {
        this.bindEvents();
    },

    bindEvents() {
        // 保存为模板按钮
        const saveTemplateBtn = document.getElementById('saveTemplateBtn');
        if (saveTemplateBtn) {
            saveTemplateBtn.addEventListener('click', () => this.showSaveTemplateDialog());
        }

        // 使用模板按钮
        const useTemplateBtn = document.getElementById('useTemplateBtn');
        if (useTemplateBtn) {
            useTemplateBtn.addEventListener('click', () => this.showTemplateList());
        }

        // 模板模态框关闭按钮
        const templateModal = document.getElementById('templateModal');
        if (templateModal) {
            const closeBtn = templateModal.querySelector('.close');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.hideTemplateModal());
            }
            
            // 点击模态框外部关闭
            templateModal.addEventListener('click', (e) => {
                if (e.target === templateModal) {
                    this.hideTemplateModal();
                }
            });
        }
    },

    async showSaveTemplateDialog() {
        const tasks = TaskList.getTasks();
        if (tasks.length === 0) {
            alert('当前没有任务，无法保存为模板');
            return;
        }

        const templateName = prompt('请输入模板名称：');
        if (!templateName || !templateName.trim()) {
            return;
        }

        // 检查模板名称是否已存在
        const existingTemplate = await Storage.getTemplate(templateName.trim());
        if (existingTemplate) {
            if (!confirm('模板已存在，是否覆盖？')) {
                return;
            }
        }

        // 保存模板（只保存任务的基本信息，不包含实际时间和完成状态）
        const templateTasks = tasks.map(task => ({
            category: task.category,
            name: task.name,
            plannedDuration: task.plannedDuration,
            plannedStartTime: task.plannedStartTime,
            plannedEndTime: task.plannedEndTime
        }));

        await Storage.saveTemplate(templateName.trim(), templateTasks);
        alert('模板保存成功！');
    },

    async showTemplateList() {
        const modal = document.getElementById('templateModal');
        if (!modal) return;

        const templateList = await Storage.getTemplateList();
        const templateListEl = document.getElementById('templateList');

        if (templateList.length === 0) {
            templateListEl.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">暂无模板</p>';
        } else {
            templateListEl.innerHTML = templateList.map(template => {
                const createdAt = new Date(template.createdAt);
                const dateStr = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}-${String(createdAt.getDate()).padStart(2, '0')}`;
                const taskCount = template.tasks ? template.tasks.length : 0;
                
                return `
                    <div class="template-item">
                        <div class="template-item-name">${this.escapeHtml(template.name)}</div>
                        <div class="template-item-info">${taskCount}个任务 | 创建于 ${dateStr}</div>
                        <div class="template-item-actions">
                            <button class="btn-primary btn-small" onclick="Template.useTemplate('${this.escapeHtml(template.name)}')">使用</button>
                            <button class="btn-danger btn-small" onclick="Template.deleteTemplate('${this.escapeHtml(template.name)}')">删除</button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        modal.classList.add('show');
    },

    async useTemplate(templateName) {
        const template = await Storage.getTemplate(templateName);
        if (!template) {
            alert('模板不存在');
            return;
        }

        if (confirm(`确定要使用模板"${templateName}"吗？这将替换当前日期的所有任务。`)) {
            await TaskList.applyTasks(template.tasks);
            this.hideTemplateModal();
            alert('模板应用成功！');
        }
    },

    async deleteTemplate(templateName) {
        if (confirm(`确定要删除模板"${templateName}"吗？`)) {
            await Storage.deleteTemplate(templateName);
            await this.showTemplateList(); // 刷新列表
        }
    },

    hideTemplateModal() {
        const modal = document.getElementById('templateModal');
        if (modal) {
            modal.classList.remove('show');
        }
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', () => {
    Template.init();
});

