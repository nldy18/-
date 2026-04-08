# 时间清单应用

一个支持微信登录和数据库存储的时间管理应用。

## 功能特性

- ✅ 微信一键登录注册
- ✅ 数据存储在SQLite数据库中
- ✅ 日历视图查看任务
- ✅ 任务管理（添加、编辑、删除、完成）
- ✅ 模板功能（保存和使用任务模板）
- ✅ 时间统计功能
- ✅ 响应式设计，支持移动端

## 技术栈

### 前端
- HTML5 / CSS3 / JavaScript (ES6+)
- 纯原生JavaScript，无框架依赖

### 后端
- Node.js + Express
- SQLite3 数据库
- JWT 认证
- 微信开放平台 OAuth2.0

## 安装和运行

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量（可选）

创建 `.env` 文件（可选，开发环境可以不配置）：

```env
PORT=3000
JWT_SECRET=your-secret-key-change-in-production
WECHAT_APPID=your-wechat-appid
WECHAT_APPSECRET=your-wechat-appsecret
NODE_ENV=production
```

### 3. 启动服务器

```bash
npm start
```

或者使用开发模式（自动重启）：

```bash
npm run dev
```

### 4. 访问应用

打开浏览器访问：`http://localhost:3000`

首次访问会自动跳转到登录页面。

## 微信登录配置

### 开发环境

开发环境默认使用**模拟登录**，无需配置微信开放平台，可以直接点击"微信一键登录"进行测试。

### 生产环境

要使用真实的微信登录，需要：

1. **注册微信开放平台账号**
   - 访问：https://open.weixin.qq.com/
   - 创建网站应用，获取 AppID 和 AppSecret

2. **配置授权回调域名**
   - 在微信开放平台设置授权回调域名为你的域名
   - 例如：`yourdomain.com`

3. **设置环境变量**
   ```env
   WECHAT_APPID=你的AppID
   WECHAT_APPSECRET=你的AppSecret
   NODE_ENV=production
   ```

4. **修改前端代码**
   - 编辑 `login.html`，将 `wechatAppId` 替换为你的真实 AppID

## 数据库

应用使用 SQLite 数据库，数据库文件会自动创建在项目根目录：`database.sqlite`

### 数据库表结构

- **users**: 用户表
  - id: 用户ID
  - openid: 微信OpenID（唯一）
  - nickname: 昵称
  - avatar_url: 头像URL
  - created_at: 创建时间
  - updated_at: 更新时间

- **tasks**: 任务表
  - id: 任务记录ID
  - user_id: 用户ID（外键）
  - date_str: 日期字符串（YYYY-MM-DD）
  - task_id: 任务ID
  - category: 分类
  - name: 任务名称
  - planned_duration: 计划时长（分钟）
  - planned_start_time: 计划开始时间
  - planned_end_time: 计划结束时间
  - actual_duration: 实际时长（分钟）
  - actual_start_time: 实际开始时间
  - actual_end_time: 实际结束时间
  - completed: 是否完成（0/1）
  - created_at: 创建时间
  - updated_at: 更新时间

- **templates**: 模板表
  - id: 模板ID
  - user_id: 用户ID（外键）
  - name: 模板名称
  - tasks: 任务列表（JSON格式）
  - created_at: 创建时间
  - updated_at: 更新时间

## API 接口

### 认证接口

- `POST /api/auth/wechat-login` - 微信登录
- `GET /api/auth/me` - 获取当前用户信息

### 任务接口

- `GET /api/tasks?date=YYYY-MM-DD` - 获取指定日期的任务列表
- `POST /api/tasks` - 保存任务列表

### 模板接口

- `GET /api/templates` - 获取所有模板
- `POST /api/templates` - 保存模板
- `DELETE /api/templates/:name` - 删除模板

所有接口（除登录接口外）都需要在请求头中携带 JWT Token：

```
Authorization: Bearer <token>
```

## 项目结构

```
cs/
├── server.js              # 后端服务器
├── package.json           # 项目配置
├── database.sqlite        # SQLite数据库（自动生成）
├── login.html            # 登录页面
├── index.html            # 主页（任务列表）
├── calendar.html         # 日历页
├── summary.html          # 统计页
├── css/
│   ├── style.css         # 全局样式
│   ├── style-table-menu.css # 任务表与菜单样式
│   ├── category.css      # 分类管理样式
│   └── fab.css           # 浮动按钮样式
└── js/
    ├── auth.js           # 认证模块
    ├── storage.js        # 存储模块（API调用）
    ├── calendar.js       # 日历组件
    ├── taskList.js       # 任务列表组件
    ├── template.js       # 模板管理组件
    ├── category.js       # 分类管理组件
    ├── summary.js        # 统计报表组件
    ├── charts.js         # 图表组件
    └── pwa.js            # PWA安装引导
```

## 使用说明

1. **登录**
   - 首次使用需要微信登录
   - 登录后会自动创建账号

2. **查看日历**
   - 在日历页面可以查看所有日期的任务情况
   - 有任务的日期会显示任务完成情况

3. **添加任务**
   - 点击日期进入任务列表页
   - 点击"添加任务"按钮
   - 填写任务信息并保存

4. **管理任务**
   - 编辑任务：修改任务信息
   - 记录时间：记录实际执行时间
   - 完成任务：勾选完成复选框
   - 删除任务：删除不需要的任务

5. **使用模板**
   - 保存模板：将当前任务列表保存为模板
   - 使用模板：快速应用已保存的模板

## 注意事项

1. **开发环境**：默认使用模拟登录，无需配置微信
2. **生产环境**：必须配置真实的微信开放平台信息
3. **数据库备份**：定期备份 `database.sqlite` 文件
4. **JWT密钥**：生产环境务必修改 `JWT_SECRET`
5. **HTTPS**：微信登录要求使用HTTPS（生产环境）

## 故障排除

### 登录失败
- 检查服务器是否正常运行
- 检查网络连接
- 查看浏览器控制台错误信息

### 数据不显示
- 检查是否已登录
- 检查API接口是否正常
- 查看浏览器网络请求

### 数据库错误
- 检查数据库文件权限
- 确保有写入权限
- 查看服务器日志

## 许可证

MIT License

## 更新日志

### v1.0.0
- ✅ 实现微信一键登录注册
- ✅ 实现数据库存储
- ✅ 实现任务管理功能
- ✅ 实现模板功能
- ✅ 实现时间统计功能

