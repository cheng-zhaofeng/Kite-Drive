# GoKite AA 支付演示 (AA Payment Demo)

基于 GoKite Account Abstraction SDK 的账户抽象支付演示应用。

## ✨ 主要功能

- ✅ **即时充值 (Auto-Fund)**: 检测到 AA 钱包余额不足时，自动从 EOA 充值
- ✅ **自动计算 (Auto-Withdraw)**: 自动计算预存手续费
- ✅ **完全闭环**: 资金随用随充，用完即退，无资金滞留
- ✅ **双模式运行**: 支持交互式 CLI 和脚本模式
- ✅ **配置分离**: 使用 `.ini` 文件管理配置文件

## 🚀 快速开始

### 1. 安装依赖
```bash
npm install
```

### 2. 配置钱包
复制 `.env.example` 到 `.env` (可选)，主要配置在 `config/user.ini`。
编辑 `config/user.ini` 设置你的私钥：

```ini
[wallet]
private_key = 66339615a927fbb37171f6cb1b7d329f9aafdcf1befedf3ff8686b28653aecc7

[network]
network_name = kite_testnet
rpc_url = https://rpc-testnet.gokite.ai
bundler_url = https://bundler-service.staging.gokite.ai/rpc/
```

### 3. 运行程序

#### 方式一：交互式命令行 (推荐)
适合初次体验，有完整的中引导流程。

```bash
npm start
```

或使用显式脚本：
```bash
npm run transfer
```

**流程**:
1. 显示钱包信息
2. 输入收款地址
3. 输入金额
4. 确认交易 
5. 系统自动执行：`充值（交易金额+动态手续费） -> 转账 -> 提现（余额 > 0.00001 时，按手续费计算后提现）`

#### 方式二：仅提现（将 AA 合约余额转回 EOA）

```bash
npm run withdraw
```

说明：
- 当 AA 合约余额 > `withdraw_threshold`（默认 0.00001）时启动提现计算
- 根据实际手续费估算，避免因手续费不足导致失败
