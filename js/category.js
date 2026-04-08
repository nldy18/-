// 分类管理模块
const Category = {
    list: [],

    // --- 数据层 ---

    // 获取分类列表
    async getList() {
        if (!Auth.isAuthenticated()) return [];
        try {
            const response = await fetch(`${Auth.API_BASE_URL}/api/categories`, {
                headers: Auth.getAuthHeaders()
            });
            if (response.ok) {
                this.list = await response.json();
                return this.list;
            }
        } catch (e) {
            // silent fail
        }
        return [];
    },

    // 新增分类
    async add(name) {
        try {
            const response = await fetch(`${Auth.API_BASE_URL}/api/categories`, {
                method: 'POST',
                headers: Auth.getAuthHeaders(),
                body: JSON.stringify({ name })
            });
            if (response.ok) {
                return await response.json();
            } else {
                const data = await response.json();
                throw new Error(data.error || '创建失败');
            }
        } catch (e) {
            throw e;
        }
    },

    // 修改分类
    async update(id, name) {
        try {
            const response = await fetch(`${Auth.API_BASE_URL}/api/categories/${id}`, {
                method: 'PUT',
                headers: Auth.getAuthHeaders(),
                body: JSON.stringify({ name })
            });
            if (response.ok) {
                return true;
            } else {
                const data = await response.json();
                throw new Error(data.error || '更新失败');
            }
        } catch (e) {
            throw e;
        }
    },

    // 删除分类
    async delete(id, migrateTo = null) {
        try {
            const body = migrateTo ? JSON.stringify({ migrateTo }) : null;
            const response = await fetch(`${Auth.API_BASE_URL}/api/categories/${id}`, {
                method: 'DELETE',
                headers: {
                    ...Auth.getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: body
            });
            
            if (response.ok) {
                return { success: true };
            } else {
                const data = await response.json();
                // 如果需要迁移，返回特定的错误结构
                if (response.status === 400 && data.hasTasks) {
                    return { success: false, needMigration: true, taskCount: data.taskCount };
                }
                throw new Error(data.error || '删除失败');
            }
        } catch (e) {
            throw e;
        }
    },

    // --- UI 层 ---

    async load() {
        await this.init();
    },

    openManager() {
        this.renderCategoryList();
        document.getElementById('categoryModal').classList.add('show');
    },

    async init() {
        await this.getList();
        this.renderCategoryList();
    },

    // 渲染管理列表
    renderCategoryList() {
        const container = document.getElementById('categoryList');
        if (!container) return;

        // 注意：不要使用 `.icon-btn`（该类在 fab.css 中被全局隐藏 display:none !important）
        // 分类管理按钮使用独立样式类 `.btn-icon`，避免与日期栏/其他组件冲突
        container.innerHTML = this.list.map(cat => `
            <div class="category-item" data-id="${cat.id}">
                <div class="category-name-display">${this.escapeHtml(cat.name)}</div>
                <div class="category-actions">
                    <button class="btn-icon edit-btn text-success" type="button" onclick="Category.startEdit(${cat.id}, '${this.escapeHtml(cat.name)}')" aria-label="编辑" title="编辑">
                        <svg class="btn-icon-svg" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                        </svg>
                    </button>
                    <button class="btn-icon delete-btn text-danger" type="button" onclick="Category.tryDelete(${cat.id})" aria-label="删除" title="删除">
                        <svg class="btn-icon-svg" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            </div>
        `).join('');
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    async submitAdd() {
        const input = document.getElementById('newCategoryInput');
        const name = input.value.trim();
        if (!name) return;
        if (name.length > 6) {
            alert('最多6个字');
            return;
        }

        try {
            await this.add(name);
            input.value = '';
            await this.refreshAll();
        } catch (e) {
            alert(e.message);
        }
    },

    startEdit(id, oldName) {
        const name = prompt('修改分类名称 (最多6字)', oldName);
        if (name === null) return;
        const newName = name.trim();
        if (!newName || newName === oldName) return;
        if (newName.length > 6) {
            alert('最多6个字');
            return;
        }

        this.update(id, newName).then(() => {
            this.refreshAll();
        }).catch(e => {
            alert(e.message);
        });
    },

    async tryDelete(id) {
        if (this.list.length <= 1) {
            alert('至少需要保留一个分类');
            return;
        }

        if (!confirm('确定删除此分类吗？')) return;

        try {
            const result = await this.delete(id);
            if (result.success) {
                this.refreshAll();
            } else if (result.needMigration) {
                this.showMigrationDialog(id, result.taskCount);
            }
        } catch (e) {
            alert(e.message);
        }
    },

    showMigrationDialog(id, count) {
        // 构建迁移目标选项（排除当前ID）
        const targets = this.list.filter(c => c.id !== id);
        if (targets.length === 0) {
            alert('没有其他分类可供迁移，无法删除');
            return;
        }

        const options = targets.map(c => `${c.id}:${c.name}`).join('\n');
        // 这里用 prompt 简化实现，理想情况是用另一个模态框
        // 既然要求轻巧，我们尝试用 confirm + prompt 的组合或者简单的自定义 prompt
        // 为了体验，我们可以临时改变 categoryModal 的内容来显示迁移界面，或者使用原生 prompt (体验稍差但简单)
        
        // 我们用一种更优雅的方式：临时重用 categoryModal 的 body
        const container = document.getElementById('categoryList');
        const originalContent = container.innerHTML;
        const addRow = document.querySelector('.category-add-row');
        if(addRow) addRow.style.display = 'none';

        container.innerHTML = `
            <div class="migration-panel">
                <div class="migration-text">该分类下有 <strong>${count}</strong> 个任务。<br>请选择将这些任务移动到：</div>
                <select id="migrateSelect" class="migration-select">
                    ${targets.map(c => `<option value="${c.id}">${this.escapeHtml(c.name)}</option>`).join('')}
                </select>
                <div class="migration-actions">
                    <button class="btn-secondary btn-small" onclick="Category.cancelMigration()">取消</button>
                    <button class="btn-primary btn-small" onclick="Category.confirmMigration(${id})">确认删除</button>
                    </div>
                </div>
            `;
            
        // 保存恢复函数
        this._restoreUI = () => {
            container.innerHTML = originalContent; // 这里的 originalContent 是旧的，其实应该重新 render
            if(addRow) addRow.style.display = 'flex';
            this.renderCategoryList();
        };
    },

    cancelMigration() {
        if (this._restoreUI) this._restoreUI();
    },

    async confirmMigration(id) {
        const select = document.getElementById('migrateSelect');
            const targetId = select.value;
        if (!targetId) return;

        try {
            await this.delete(id, targetId);
            alert('删除成功');
            if (this._restoreUI) {
                const addRow = document.querySelector('.category-add-row');
                if(addRow) addRow.style.display = 'flex';
            }
            await this.refreshAll();
        } catch (e) {
            alert(e.message);
            this.cancelMigration();
        }
    },

    // 刷新数据和所有 UI
    async refreshAll() {
        await this.getList();
        this.renderCategoryList();
        // 通知 TaskList 更新下拉框
        if (window.TaskList && window.TaskList.loadCategories) {
            window.TaskList.loadCategories();
        }
    }
};
