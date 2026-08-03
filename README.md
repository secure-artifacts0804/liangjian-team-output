# 量见 · 团队产量台

量见是一个面向制作团队的产量管理工具。第一版固定包含：

1. 人员面板：人员、组别、月定量、当日完成量、分类定量和进度。
2. 报数打卡：人员纵向排列，日期从左向右递减，每天记录中午、下午、晚上三次报数。
3. 实际产量：扫描 Google Drive 文件夹及子文件夹，识别图片、视频、视频时长和“已选用”目录，计算实际完成量及合格率。
4. 权限设置：管理员指定或取消组长；员工仅查看和提交自己的数据，组长可查看所有人员并调整定额。

每个制作类型可以独立设置计数规则：按文件数计数，或按每 N 秒视频时长折算一个完成量（四舍五入）。

## Windows 软件

从 GitHub Releases 下载 `LiangJian-v0.1.6-windows-x64.zip`，必须先完整解压，再进入解压后的文件夹双击 `LiangJian.exe`。这是无需安装的 Windows 64 位桌面软件，后续可以直接删除整个文件夹卸载。桌面客户端连接正式云端系统，因此需要网络；数据和 Drive 扫描不会保存在软件包内。

此测试版尚未购买 Windows Authenticode 代码签名证书，Windows 第一次运行时可能显示“未知发布者”。请只从本仓库 Release 下载，并按下方步骤核验文件。

## 本地开发

```bash
npm ci --ignore-scripts
npm run dev
```

桌面客户端：

```bash
npm --prefix desktop ci
npm --prefix desktop run start
```

## Google Drive 扫描器

1. 用固定统计账号创建 Apps Script 项目。
2. 将 `google-apps-script/Code.gs` 和 `appsscript.json` 放入项目。
3. 部署为 Web App，并设置为由统计账号执行。
4. 在 Apps Script 脚本属性中设置独立的长随机值 `SCANNER_SECRET`。
5. 将相同值保存在应用环境变量 `DRIVE_SCANNER_SECRET`，并把 `/exec` 地址保存为 `DRIVE_SCANNER_URL`。
6. 将待统计文件夹以“查看者”权限共享给统计账号。

扫描器只申请 `drive.readonly`，仅读取文件元数据，不下载、复制、编辑或删除媒体。多个“已选用”“已经选用”“选用”等目录均可识别；“待选用”不会被误判。

## 发布与验证

正式 Release 只能由 `vX.Y.Z` tag 触发，tag、根项目版本和桌面客户端版本必须完全一致。GitHub Actions 会运行测试和高危漏洞门禁，然后生成 Windows 安装包、源码适配包、SHA-256 校验文件、两份 SPDX SBOM 和 Sigstore 签名包。

```powershell
gh release verify v0.1.6
gh release verify-asset v0.1.6 LiangJian-v0.1.6-windows-x64.zip

cosign verify-blob LiangJian-v0.1.6-windows-x64.zip `
  --bundle LiangJian-v0.1.6-windows-x64.sigstore.json `
  --certificate-identity "https://github.com/zoehate123-ux/liangjian-team-output/.github/workflows/release.yml@refs/tags/v0.1.6" `
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com"
```

详见 `SECURITY.md`。
