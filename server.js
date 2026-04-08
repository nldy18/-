const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const crypto = require('crypto'); // 引入 crypto 模块

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin-secret-token'; // 后台管理 Token

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// 密码处理工具函数
const hashPassword = (password) => {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return { salt, hash };
};

const verifyPassword = (password, salt, hash) => {
    const verifyHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return hash === verifyHash;
};

// 初始化数据库
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// 初始化数据库表
db.serialize(() => {
    // 用户表 - 增加 phone, salt, password_hash
    // 注意：openid 不再作为唯一的必填项，为了兼容旧数据，我们在代码逻辑层控制
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        openid TEXT,
        phone TEXT,
        nickname TEXT,
        avatar_url TEXT,
        salt TEXT,
        password_hash TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(openid),
        UNIQUE(phone)
    )`, (err) => {
        if (!err) {
            // 尝试添加新列（如果是旧表结构）
            const addColumn = (colName, type) => {
                db.run(`ALTER TABLE users ADD COLUMN ${colName} ${type}`, (err) => {
                    // 忽略 "duplicate column name" 错误
                });
            };
            addColumn('phone', 'TEXT');
            addColumn('salt', 'TEXT');
            addColumn('password_hash', 'TEXT');
            
            // 移除 openid 的 NOT NULL 约束比较麻烦，这里暂时允许 openid 为 null (如果是新表)
            // 对于旧表，openid 已经是 NOT NULL，我们通过逻辑保证微信登录的有 openid，账号登录的 openid 为 NULL (如果是新建库) 
            // 或者给账号登录用户一个假的 openid 前缀
        }
    });

    // 任务表
    db.run(`CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        date_str TEXT NOT NULL,
        task_id INTEGER NOT NULL,
        category TEXT,
        name TEXT NOT NULL,
        planned_duration INTEGER,
        planned_start_time TEXT,
        planned_end_time TEXT,
        actual_duration INTEGER,
        actual_start_time TEXT,
        actual_end_time TEXT,
        completed INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(user_id, date_str, task_id)
    )`);

    // 模板表
    db.run(`CREATE TABLE IF NOT EXISTS templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        tasks TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(user_id, name)
    )`);

    // 分类表
    db.run(`CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        is_system INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(user_id, name)
    )`);
});

// JWT认证中间件
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: '未授权，请先登录' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: '令牌无效' });
        }
        req.user = user;
        next();
    });
};

// 微信登录配置（需要替换为真实的微信开放平台配置）
const WECHAT_CONFIG = {
    appId: process.env.WECHAT_APPID || 'your-wechat-appid',
    appSecret: process.env.WECHAT_APPSECRET || 'your-wechat-appsecret'
};

// 管理员认证中间件
const authenticateAdmin = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token === ADMIN_TOKEN) {
        next();
    } else {
        res.status(403).json({ error: '无权访问' });
    }
};

// 账号登录接口
app.post('/api/auth/login', (req, res) => {
    const { phone, password } = req.body;
    if (!phone || !password) {
        return res.status(400).json({ error: '请输入手机号和密码' });
    }

    db.get('SELECT * FROM users WHERE phone = ?', [phone], (err, user) => {
        if (err) return res.status(500).json({ error: '数据库错误' });
        if (!user || !user.salt || !user.password_hash) {
            return res.status(401).json({ error: '账号或密码错误' }); // 模糊报错安全点
        }

        if (verifyPassword(password, user.salt, user.password_hash)) {
            const token = jwt.sign({ userId: user.id, phone: user.phone }, JWT_SECRET, { expiresIn: '30d' });
            res.json({ 
                token, 
                user: { 
                    id: user.id, 
                    nickname: user.nickname, 
                    avatar_url: user.avatar_url,
                    phone: user.phone 
                } 
            });
        } else {
            res.status(401).json({ error: '账号或密码错误' });
        }
    });
});

// 修改密码接口
app.post('/api/auth/change-password', authenticateToken, (req, res) => {
    const { newPassword } = req.body;
    const userId = req.user.userId;

    // 密码强度校验：数字+字母，区分大小写（这里简单校验包含数字和字母）
    const hasNumber = /\d/.test(newPassword);
    const hasLetter = /[a-zA-Z]/.test(newPassword);
    if (!newPassword || newPassword.length < 6 || !hasNumber || !hasLetter) {
        return res.status(400).json({ error: '密码必须包含数字和字母，且长度不少于6位' });
    }

    const { salt, hash } = hashPassword(newPassword);

    db.run('UPDATE users SET salt = ?, password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', 
        [salt, hash, userId], 
        function(err) {
            if (err) return res.status(500).json({ error: '修改失败' });
            res.json({ success: true, message: '密码修改成功' });
        }
    );
});

// Admin: 创建账号
app.post('/api/admin/users', authenticateAdmin, (req, res) => {
    const { phone, nickname } = req.body;
    if (!phone) return res.status(400).json({ error: '缺少手机号' });

    // 初始密码 12345678
    const { salt, hash } = hashPassword('12345678');
    const finalNickname = nickname || `用户${phone.slice(-4)}`;
    
    // 为了兼容 openid UNIQUE 约束，给账号用户生成一个假的 openid
    const fakeOpenid = `phone_${phone}`; 

    db.run('INSERT INTO users (openid, phone, nickname, salt, password_hash) VALUES (?, ?, ?, ?, ?)',
        [fakeOpenid, phone, finalNickname, salt, hash],
        function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) {
                    return res.status(400).json({ error: '该手机号已存在' });
                }
                return res.status(500).json({ error: '创建失败: ' + err.message });
            }
            res.json({ success: true, userId: this.lastID, message: '账号创建成功，初始密码: 12345678' });
        }
    );
});

// Admin: 重置密码
app.post('/api/admin/users/:phone/reset-password', authenticateAdmin, (req, res) => {
    const { phone } = req.params;
    
    // 重置为 12345678
    const { salt, hash } = hashPassword('12345678');

    db.run('UPDATE users SET salt = ?, password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE phone = ?',
        [salt, hash, phone],
        function(err) {
            if (err) return res.status(500).json({ error: '重置失败' });
            if (this.changes === 0) return res.status(404).json({ error: '未找到该用户' });
            res.json({ success: true, message: '密码已重置为: 12345678' });
        }
    );
});

// 健康检查接口
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: '服务器运行正常' });
});

// 微信登录接口
app.post('/api/auth/wechat-login', async (req, res) => {
    try {
        const { code } = req.body;

        if (!code) {
            return res.status(400).json({ error: '缺少授权码' });
        }

        // 开发环境：模拟微信登录（生产环境需要替换为真实的微信API调用）
        // 判断是否为开发模式：检查环境变量或配置
        const isDevelopment = process.env.NODE_ENV !== 'production' && 
                              (!WECHAT_CONFIG.appId || WECHAT_CONFIG.appId === 'your-wechat-appid');
        
        if (isDevelopment) {
            // 模拟登录，生成一个模拟的openid
            const mockOpenid = `mock_openid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const mockUserInfo = {
                openid: mockOpenid,
                nickname: '测试用户',
                avatar_url: 'https://via.placeholder.com/100'
            };

            // 查找或创建用户
            db.get('SELECT * FROM users WHERE openid = ?', [mockOpenid], (err, user) => {
                if (err) {
                    return res.status(500).json({ error: '数据库错误' });
                }

                if (user) {
                    // 用户已存在，生成token
                    const token = jwt.sign({ userId: user.id, openid: user.openid }, JWT_SECRET, { expiresIn: '30d' });
                    return res.json({ token, user: { id: user.id, nickname: user.nickname, avatar_url: user.avatar_url } });
                } else {
                    // 创建新用户
                    db.run('INSERT INTO users (openid, nickname, avatar_url) VALUES (?, ?, ?)',
                        [mockUserInfo.openid, mockUserInfo.nickname, mockUserInfo.avatar_url],
                        function(err) {
                            if (err) {
                                return res.status(500).json({ error: '创建用户失败' });
                            }
                            const token = jwt.sign({ userId: this.lastID, openid: mockUserInfo.openid }, JWT_SECRET, { expiresIn: '30d' });
                            res.json({ token, user: { id: this.lastID, nickname: mockUserInfo.nickname, avatar_url: mockUserInfo.avatar_url } });
                        });
                }
            });
        } else {
            // 生产环境：真实的微信登录流程
            // 1. 通过code获取access_token
            const tokenResponse = await axios.get('https://api.weixin.qq.com/sns/oauth2/access_token', {
                params: {
                    appid: WECHAT_CONFIG.appId,
                    secret: WECHAT_CONFIG.appSecret,
                    code: code,
                    grant_type: 'authorization_code'
                }
            });

            if (tokenResponse.data.errcode) {
                return res.status(400).json({ error: tokenResponse.data.errmsg || '微信登录失败' });
            }

            const { access_token, openid } = tokenResponse.data;

            // 2. 通过access_token获取用户信息
            const userInfoResponse = await axios.get('https://api.weixin.qq.com/sns/userinfo', {
                params: {
                    access_token: access_token,
                    openid: openid,
                    lang: 'zh_CN'
                }
            });

            if (userInfoResponse.data.errcode) {
                return res.status(400).json({ error: userInfoResponse.data.errmsg || '获取用户信息失败' });
            }

            const userInfo = userInfoResponse.data;

            // 查找或创建用户
            db.get('SELECT * FROM users WHERE openid = ?', [openid], (err, user) => {
                if (err) {
                    return res.status(500).json({ error: '数据库错误' });
                }

                if (user) {
                    // 更新用户信息
                    db.run('UPDATE users SET nickname = ?, avatar_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                        [userInfo.nickname, userInfo.headimgurl, user.id]);
                    const token = jwt.sign({ userId: user.id, openid: user.openid }, JWT_SECRET, { expiresIn: '30d' });
                    return res.json({ token, user: { id: user.id, nickname: userInfo.nickname, avatar_url: userInfo.headimgurl } });
                } else {
                    // 创建新用户
                    db.run('INSERT INTO users (openid, nickname, avatar_url) VALUES (?, ?, ?)',
                        [openid, userInfo.nickname, userInfo.headimgurl],
                        function(err) {
                            if (err) {
                                return res.status(500).json({ error: '创建用户失败' });
                            }
                            const token = jwt.sign({ userId: this.lastID, openid: openid }, JWT_SECRET, { expiresIn: '30d' });
                            res.json({ token, user: { id: this.lastID, nickname: userInfo.nickname, avatar_url: userInfo.headimgurl } });
                        });
                }
            });
        }
    } catch (error) {
        console.error('微信登录错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 获取当前用户信息
app.get('/api/auth/me', authenticateToken, (req, res) => {
    db.get('SELECT id, nickname, avatar_url, phone, created_at FROM users WHERE id = ?', [req.user.userId], (err, user) => {
        if (err) {
            return res.status(500).json({ error: '数据库错误' });
        }
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }
        res.json(user);
    });
});

// 修改用户信息（昵称）
app.put('/api/auth/profile', authenticateToken, (req, res) => {
    const { nickname } = req.body;
    if (!nickname || nickname.trim().length === 0) {
        return res.status(400).json({ error: '昵称不能为空' });
    }

    db.run('UPDATE users SET nickname = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', 
        [nickname.trim(), req.user.userId], 
        function(err) {
            if (err) return res.status(500).json({ error: '更新失败' });
            res.json({ success: true, nickname: nickname.trim() });
        }
    );
});

// 获取任务列表（支持单日或日期范围）
app.get('/api/tasks', authenticateToken, (req, res) => {
    const { date, startDate, endDate } = req.query;

    if (date) {
        // 单日查询
        db.all('SELECT * FROM tasks WHERE user_id = ? AND date_str = ? ORDER BY planned_start_time ASC',
            [req.user.userId, date],
            (err, rows) => {
                if (err) return res.status(500).json({ error: '数据库错误' });
                const tasks = rows.map(mapTaskRow);
                res.json(tasks);
            });
    } else if (startDate && endDate) {
        // 范围查询
        db.all('SELECT * FROM tasks WHERE user_id = ? AND date_str >= ? AND date_str <= ? ORDER BY date_str ASC, planned_start_time ASC',
            [req.user.userId, startDate, endDate],
            (err, rows) => {
                if (err) return res.status(500).json({ error: '数据库错误' });
                const tasks = rows.map(mapTaskRow);
                res.json(tasks);
            });
    } else {
        return res.status(400).json({ error: '缺少日期参数' });
    }
});

function mapTaskRow(row) {
    return {
                id: row.task_id,
                category: row.category,
                name: row.name,
                plannedDuration: row.planned_duration,
                plannedStartTime: row.planned_start_time,
                plannedEndTime: row.planned_end_time,
                actualDuration: row.actual_duration,
                actualStartTime: row.actual_start_time,
                actualEndTime: row.actual_end_time,
        completed: !!row.completed,
        dateStr: row.date_str
    };
}

// 保存任务列表
app.post('/api/tasks', authenticateToken, (req, res) => {
    const { date, tasks } = req.body;
    if (!date || !Array.isArray(tasks)) {
        return res.status(400).json({ error: '参数错误' });
    }

    // 开始事务
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        // 删除该日期的所有任务
        db.run('DELETE FROM tasks WHERE user_id = ? AND date_str = ?', [req.user.userId, date], (err) => {
            if (err) {
                db.run('ROLLBACK');
                return res.status(500).json({ error: '删除任务失败' });
            }

            // 插入新任务
            const stmt = db.prepare(`INSERT INTO tasks 
                (user_id, date_str, task_id, category, name, planned_duration, planned_start_time, 
                 planned_end_time, actual_duration, actual_start_time, actual_end_time, completed)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

            let completed = 0;
            tasks.forEach((task, index) => {
                stmt.run(
                    req.user.userId,
                    date,
                    task.id,
                    task.category || null,
                    task.name,
                    task.plannedDuration || null,
                    task.plannedStartTime || null,
                    task.plannedEndTime || null,
                    task.actualDuration || null,
                    task.actualStartTime || null,
                    task.actualEndTime || null,
                    task.completed ? 1 : 0
                );
            });

            stmt.finalize((err) => {
                if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: '保存任务失败' });
                }
                db.run('COMMIT', (err) => {
                    if (err) {
                        return res.status(500).json({ error: '提交事务失败' });
                    }
                    res.json({ success: true, message: '保存成功' });
                });
            });
        });
    });
});

// 获取所有模板
app.get('/api/templates', authenticateToken, (req, res) => {
    db.all('SELECT * FROM templates WHERE user_id = ? ORDER BY created_at DESC',
        [req.user.userId],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: '数据库错误' });
            }

            const templates = rows.map(row => ({
                name: row.name,
                tasks: JSON.parse(row.tasks),
                createdAt: row.created_at
            }));

            res.json(templates);
        });
});

// 保存模板
app.post('/api/templates', authenticateToken, (req, res) => {
    const { name, tasks } = req.body;
    if (!name || !Array.isArray(tasks)) {
        return res.status(400).json({ error: '参数错误' });
    }

    const tasksJson = JSON.stringify(tasks);

    db.run('INSERT OR REPLACE INTO templates (user_id, name, tasks, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
        [req.user.userId, name, tasksJson],
        function(err) {
            if (err) {
                return res.status(500).json({ error: '保存模板失败' });
            }
            res.json({ success: true, message: '模板保存成功' });
        });
});

// 删除模板
app.delete('/api/templates/:name', authenticateToken, (req, res) => {
    const { name } = req.params;

    db.run('DELETE FROM templates WHERE user_id = ? AND name = ?',
        [req.user.userId, name],
        function(err) {
            if (err) {
                return res.status(500).json({ error: '删除模板失败' });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: '模板不存在' });
            }
            res.json({ success: true, message: '模板删除成功' });
        });
});

// --- 分类管理接口 ---

// 初始化默认分类
const initDefaultCategories = (userId) => {
    return new Promise((resolve, reject) => {
        const defaultCategories = ['工作', '事业', '陪家人', '其它'];
        const placeholders = defaultCategories.map(() => '(?, ?, 1)').join(',');
        const values = [];
        defaultCategories.forEach(cat => {
            values.push(userId, cat);
        });

        db.run(`INSERT OR IGNORE INTO categories (user_id, name, is_system) VALUES ${placeholders}`, values, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
};

// 获取分类列表
app.get('/api/categories', authenticateToken, (req, res) => {
    // 先尝试查询，如果为空则初始化
    db.all('SELECT * FROM categories WHERE user_id = ? ORDER BY id ASC', [req.user.userId], async (err, rows) => {
        if (err) return res.status(500).json({ error: '数据库错误' });

        if (rows.length === 0) {
            try {
                await initDefaultCategories(req.user.userId);
                // 重新查询
                db.all('SELECT * FROM categories WHERE user_id = ? ORDER BY id ASC', [req.user.userId], (err, newRows) => {
                    if (err) return res.status(500).json({ error: '初始化分类失败' });
                    res.json(newRows);
                });
            } catch (e) {
                res.status(500).json({ error: '初始化分类失败' });
            }
        } else {
            res.json(rows);
        }
    });
});

// 新增分类
app.post('/api/categories', authenticateToken, (req, res) => {
    const { name } = req.body;
    if (!name || name.trim().length === 0) return res.status(400).json({ error: '分类名称不能为空' });
    if (name.length > 6) return res.status(400).json({ error: '分类名称最多6个字' });

    db.run('INSERT INTO categories (user_id, name, is_system) VALUES (?, ?, 0)', [req.user.userId, name], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE')) return res.status(400).json({ error: '分类名称已存在' });
            return res.status(500).json({ error: '创建失败' });
        }
        res.json({ id: this.lastID, name, is_system: 0 });
    });
});

// 修改分类
app.put('/api/categories/:id', authenticateToken, (req, res) => {
    const { name } = req.body;
    const { id } = req.params;
    
    const newName = (name || '').trim();
    if (!newName) return res.status(400).json({ error: '分类名称不能为空' });
    if (newName.length > 6) return res.status(400).json({ error: '分类名称最多6个字' });

    // 分类名被用于 tasks.category 字段；重命名分类时，需要同步更新已有任务分类名
    db.get('SELECT name FROM categories WHERE id = ? AND user_id = ?', [id, req.user.userId], (err, row) => {
        if (err) return res.status(500).json({ error: '查询失败' });
        if (!row) return res.status(404).json({ error: '分类不存在' });

        const oldName = row.name;
        if (oldName === newName) return res.json({ success: true });

        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            db.run('UPDATE categories SET name = ? WHERE id = ? AND user_id = ?', [newName, id, req.user.userId], function(updateErr) {
                if (updateErr) {
                    return db.run('ROLLBACK', () => {
                        if (updateErr.message && updateErr.message.includes('UNIQUE')) {
                            return res.status(400).json({ error: '分类名称已存在' });
                        }
                        return res.status(500).json({ error: '更新失败' });
                    });
                }

                if (this.changes === 0) {
                    return db.run('ROLLBACK', () => res.status(404).json({ error: '分类不存在' }));
                }

                db.run('UPDATE tasks SET category = ? WHERE user_id = ? AND category = ?', [newName, req.user.userId, oldName], (taskErr) => {
                    if (taskErr) {
                        return db.run('ROLLBACK', () => res.status(500).json({ error: '同步任务分类失败' }));
                    }

                    db.run('COMMIT', (commitErr) => {
                        if (commitErr) {
                            return db.run('ROLLBACK', () => res.status(500).json({ error: '更新失败' }));
                        }
                        return res.json({ success: true });
                    });
                });
            });
        });
    });
});

// 删除分类
app.delete('/api/categories/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { migrateTo } = req.body; // 可选：目标分类ID

    // 1. 检查是否有关联任务
    db.get('SELECT name FROM categories WHERE id = ? AND user_id = ?', [id, req.user.userId], (err, category) => {
        if (err || !category) return res.status(404).json({ error: '分类不存在' });

        db.get('SELECT COUNT(*) as count FROM tasks WHERE user_id = ? AND category = ?', [req.user.userId, category.name], (err, result) => {
            if (err) return res.status(500).json({ error: '检查关联任务失败' });

            if (result.count > 0) {
                // 如果有关联任务且没有提供迁移目标
                if (!migrateTo) {
                    return res.status(400).json({ error: '该分类下有任务，请选择替换分类', hasTasks: true, taskCount: result.count });
                }

                // 获取目标分类名称
                db.get('SELECT name FROM categories WHERE id = ? AND user_id = ?', [migrateTo, req.user.userId], (err, targetCategory) => {
                    if (err || !targetCategory) return res.status(400).json({ error: '目标分类不存在' });

                    // 迁移任务并删除分类
                    db.serialize(() => {
                        db.run('BEGIN TRANSACTION');
                        db.run('UPDATE tasks SET category = ? WHERE user_id = ? AND category = ?', [targetCategory.name, req.user.userId, category.name]);
                        db.run('DELETE FROM categories WHERE id = ? AND user_id = ?', [id, req.user.userId]);
                        db.run('COMMIT', (err) => {
                            if (err) {
                                db.run('ROLLBACK');
                                return res.status(500).json({ error: '删除失败' });
                            }
                            res.json({ success: true });
                        });
                    });
                });
            } else {
                // 无关联任务，直接删除
                db.run('DELETE FROM categories WHERE id = ? AND user_id = ?', [id, req.user.userId], function(err) {
                    if (err) return res.status(500).json({ error: '删除失败' });
                    res.json({ success: true });
                });
            }
        });
        });
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
    console.log('注意：当前使用模拟微信登录，生产环境需要配置真实的微信开放平台信息');
});

// 优雅关闭
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            console.error(err.message);
        }
        console.log('数据库连接已关闭');
        process.exit(0);
    });
});

