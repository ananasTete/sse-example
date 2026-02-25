## SQLite Chat Storage

`/app/use-chat` 已接入 SQLite 持久化（Prisma）。

### 1) 安装依赖

```bash
pnpm install
```

### 2) 设置数据库地址

在项目根目录创建 `.env.local`：

```bash
DATABASE_URL="file:./dev.db"
```

### 3) 生成 Prisma Client 并迁移

```bash
pnpm prisma:generate
pnpm prisma:migrate --name init_chat_schema
```

### 4) 启动

```bash
pnpm dev
```

访问 `http://localhost:3000/use-chat`，首次打开会自动创建 chat，并将 `chatId` 写入 URL。
