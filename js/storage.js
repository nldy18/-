// 存储管理模块（支持API和本地存储）
const Storage = {
    // 存储键名（用于本地存储降级）
    TASKS_KEY: 'timeList_tasks',
    TEMPLATES_KEY: 'timeList_templates',
    
    // 任务缓存（用于优化性能）
    _tasksCache: {},
    _templatesCache: null,

    // 获取指定日期的任务列表
    async getTasksByDate(dateStr) {
        // 如果已登录，从API获取
        if (Auth.isAuthenticated()) {
            try {
                const response = await fetch(`${Auth.API_BASE_URL}/api/tasks?date=${dateStr}`, {
                    headers: Auth.getAuthHeaders()
                });

                if (response.ok) {
                    const tasks = await response.json();
                    this._tasksCache[dateStr] = tasks;
                    return tasks;
                } else if (response.status === 401) {
                    // token过期，跳转登录
                    Auth.logout();
                    return [];
                } else {
                    throw new Error('获取任务失败');
                }
            } catch (error) {
                console.error('API获取任务失败，使用本地存储:', error);
                // 降级到本地存储
                const tasks = this.getAllTasks();
                return tasks[dateStr] || [];
            }
        } else {
            // 未登录，使用本地存储
            const tasks = this.getAllTasks();
            return tasks[dateStr] || [];
        }
    },

    // 保存指定日期的任务列表
    async saveTasksByDate(dateStr, tasks) {
        // 如果已登录，保存到API
        if (Auth.isAuthenticated()) {
            try {
                const response = await fetch(`${Auth.API_BASE_URL}/api/tasks`, {
                    method: 'POST',
                    headers: Auth.getAuthHeaders(),
                    body: JSON.stringify({ date: dateStr, tasks: tasks })
                });

                if (response.ok) {
                    this._tasksCache[dateStr] = tasks;
                    return true;
                } else if (response.status === 401) {
                    Auth.logout();
                    return false;
                } else {
                    throw new Error('保存任务失败');
                }
            } catch (error) {
                console.error('API保存任务失败，使用本地存储:', error);
                // 降级到本地存储
                const allTasks = this.getAllTasks();
                allTasks[dateStr] = tasks;
                localStorage.setItem(this.TASKS_KEY, JSON.stringify(allTasks));
                return true;
            }
        } else {
            // 未登录，使用本地存储
            const allTasks = this.getAllTasks();
            allTasks[dateStr] = tasks;
            localStorage.setItem(this.TASKS_KEY, JSON.stringify(allTasks));
            return true;
        }
    },

    // 获取所有任务数据（仅用于本地存储降级）
    getAllTasks() {
        const data = localStorage.getItem(this.TASKS_KEY);
        return data ? JSON.parse(data) : {};
    },

    // 删除指定日期的任务
    async deleteTasksByDate(dateStr) {
        // 删除操作通过保存空数组实现
        return await this.saveTasksByDate(dateStr, []);
    },

    // 保存模板
    async saveTemplate(templateName, tasks) {
        // 如果已登录，保存到API
        if (Auth.isAuthenticated()) {
            try {
                const response = await fetch(`${Auth.API_BASE_URL}/api/templates`, {
                    method: 'POST',
                    headers: Auth.getAuthHeaders(),
                    body: JSON.stringify({ name: templateName, tasks: tasks })
                });

                if (response.ok) {
                    this._templatesCache = null; // 清除缓存
                    return true;
                } else if (response.status === 401) {
                    Auth.logout();
                    return false;
                } else {
                    throw new Error('保存模板失败');
                }
            } catch (error) {
                console.error('API保存模板失败，使用本地存储:', error);
                // 降级到本地存储
                const templates = this.getAllTemplates();
                templates[templateName] = {
                    name: templateName,
                    tasks: tasks,
                    createdAt: new Date().toISOString()
                };
                localStorage.setItem(this.TEMPLATES_KEY, JSON.stringify(templates));
                return true;
            }
        } else {
            // 未登录，使用本地存储
            const templates = this.getAllTemplates();
            templates[templateName] = {
                name: templateName,
                tasks: tasks,
                createdAt: new Date().toISOString()
            };
            localStorage.setItem(this.TEMPLATES_KEY, JSON.stringify(templates));
            return true;
        }
    },

    // 获取所有模板
    async getAllTemplates() {
        // 如果已登录，从API获取
        if (Auth.isAuthenticated()) {
            try {
                if (this._templatesCache) {
                    return this._templatesCache;
                }

                const response = await fetch(`${Auth.API_BASE_URL}/api/templates`, {
                    headers: Auth.getAuthHeaders()
                });

                if (response.ok) {
                    const templates = await response.json();
                    // 转换为对象格式以保持兼容性
                    const templatesObj = {};
                    templates.forEach(t => {
                        templatesObj[t.name] = t;
                    });
                    this._templatesCache = templatesObj;
                    return templatesObj;
                } else if (response.status === 401) {
                    Auth.logout();
                    return {};
                } else {
                    throw new Error('获取模板失败');
                }
            } catch (error) {
                console.error('API获取模板失败，使用本地存储:', error);
                // 降级到本地存储
                const data = localStorage.getItem(this.TEMPLATES_KEY);
                return data ? JSON.parse(data) : {};
            }
        } else {
            // 未登录，使用本地存储
            const data = localStorage.getItem(this.TEMPLATES_KEY);
            return data ? JSON.parse(data) : {};
        }
    },

    // 获取指定模板
    async getTemplate(templateName) {
        const templates = await this.getAllTemplates();
        return templates[templateName] || null;
    },

    // 删除模板
    async deleteTemplate(templateName) {
        // 如果已登录，从API删除
        if (Auth.isAuthenticated()) {
            try {
                const response = await fetch(`${Auth.API_BASE_URL}/api/templates/${encodeURIComponent(templateName)}`, {
                    method: 'DELETE',
                    headers: Auth.getAuthHeaders()
                });

                if (response.ok) {
                    this._templatesCache = null; // 清除缓存
                    return true;
                } else if (response.status === 401) {
                    Auth.logout();
                    return false;
                } else {
                    throw new Error('删除模板失败');
                }
            } catch (error) {
                console.error('API删除模板失败，使用本地存储:', error);
                // 降级到本地存储
                const templates = this.getAllTemplates();
                delete templates[templateName];
                localStorage.setItem(this.TEMPLATES_KEY, JSON.stringify(templates));
                return true;
            }
        } else {
            // 未登录，使用本地存储
            const templates = await this.getAllTemplates();
            delete templates[templateName];
            localStorage.setItem(this.TEMPLATES_KEY, JSON.stringify(templates));
            return true;
        }
    },

    // 获取模板列表（返回数组格式）
    async getTemplateList() {
        const templates = await this.getAllTemplates();
        return Object.values(templates);
    },

    // 格式化日期字符串 (YYYY-MM-DD)
    formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    // 解析日期字符串
    parseDate(dateStr) {
        return new Date(dateStr + 'T00:00:00');
    }
};

