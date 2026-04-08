// 认证管理模块
const Auth = {
    // API 基础路径：使用相对路径以支持不同端口和环境
    API_BASE_URL: '',

    // 获取认证token
    getToken() {
        return localStorage.getItem('auth_token');
    },

    // 获取用户信息
    getUserInfo() {
        const userInfo = localStorage.getItem('user_info');
        return userInfo ? JSON.parse(userInfo) : null;
    },

    // 检查是否已登录
    isAuthenticated() {
        return !!this.getToken();
    },

    // 登出
    logout() {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_info');
        window.location.href = 'login.html';
    },

    // 获取请求头（包含token）
    getAuthHeaders() {
        const token = this.getToken();
        return {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        };
    },

    // 检查登录状态，如果未登录则跳转到登录页
    requireAuth() {
        if (!this.isAuthenticated()) {
            window.location.href = 'login.html';
            return false;
        }
        return true;
    },

    // 账号登录
    async loginByAccount(phone, password) {
        const response = await fetch(`${this.API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, password })
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: '登录失败' }));
            throw new Error(error.error || '登录失败');
        }

        const data = await response.json();
        if (data.token) {
            localStorage.setItem('auth_token', data.token);
            localStorage.setItem('user_info', JSON.stringify(data.user));
            return data.user;
        }
        throw new Error('未获取到 Token');
    },

    // 修改密码
    async changePassword(newPassword) {
        const response = await fetch(`${this.API_BASE_URL}/api/auth/change-password`, {
            method: 'POST',
            headers: this.getAuthHeaders(),
            body: JSON.stringify({ newPassword })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: '修改失败' }));
            throw new Error(error.error || '修改失败');
        }
        return true;
    },

    // 修改昵称
    async updateProfile(nickname) {
        const response = await fetch(`${this.API_BASE_URL}/api/auth/profile`, {
            method: 'PUT',
            headers: this.getAuthHeaders(),
            body: JSON.stringify({ nickname })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: '修改失败' }));
            throw new Error(error.error || '修改失败');
        }
        
        const data = await response.json();
        // 更新本地缓存
        const userInfo = this.getUserInfo();
        if (userInfo) {
            userInfo.nickname = data.nickname;
            localStorage.setItem('user_info', JSON.stringify(userInfo));
        }
        return data.nickname;
    }
};

