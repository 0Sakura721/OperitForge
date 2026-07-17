/* METADATA
{
    "name": "reasonix_bridge",
    "display_name": {
        "zh": "Reasonix 直连",
        "en": "Reasonix Direct"
    },
    "description": {
        "zh": "直接接入 Reasonix Coding Agent。安装: `npm i -g reasonix`。通过 HTTP API 直连 Reasonix Serve，无需中间转接。提供 Web UI 打开、API 问答、任务执行三种接入方式。自带安装检测与自动更新检查。",
        "en": "Direct access to Reasonix Coding Agent. Install: `npm i -g reasonix`. Connects via HTTP API (Reasonix Serve). Provides Web UI, API Q&A, and task execution. Built-in install detection and auto-update check."
    },
    "category": "AI",
    "tools": [
        {
            "name": "reasonix_ask",
            "description": {
                "zh": "直接向 Reasonix 提问并获取回答（通过 HTTP API）。用户输入直送 Reasonix，返回原始回答，无中间转述。",
                "en": "Ask Reasonix directly via HTTP API. User input goes straight to Reasonix, returns raw response."
            },
            "parameters": [
                {
                    "name": "query",
                    "description": { "zh": "用户的问题或任务描述", "en": "The user's question or task description" },
                    "type": "string",
                    "required": true
                },
                {
                    "name": "timeoutMs",
                    "description": { "zh": "超时时间（毫秒），默认 120000（2分钟）", "en": "Timeout in milliseconds, defaults to 120000" },
                    "type": "string",
                    "required": false
                }
            ]
        },
        {
            "name": "reasonix_task",
            "description": {
                "zh": "让 Reasonix 执行复杂任务（通过 HTTP API）。适合代码实现、重构、测试等场景。返回 Reasonix 原始回答。",
                "en": "Let Reasonix execute complex tasks via HTTP API. Returns raw Reasonix response."
            },
            "parameters": [
                {
                    "name": "task",
                    "description": { "zh": "任务描述", "en": "Task description" },
                    "type": "string",
                    "required": true
                },
                {
                    "name": "timeoutMs",
                    "description": { "zh": "超时时间（毫秒），默认 180000（3分钟）", "en": "Timeout in milliseconds, defaults to 180000" },
                    "type": "string",
                    "required": false
                }
            ]
        },
        {
            "name": "reasonix_open",
            "description": {
                "zh": "在设备浏览器中打开 Reasonix Web UI。确保 Serve 在后台运行，然后直接打开 Reasonix 的原生聊天界面，你可以直接与 Reasonix 对话，无需经过 Operit AI。",
                "en": "Open Reasonix Web UI in device browser. Start the serve daemon if needed, then open the native Reasonix chat interface. Chat directly with Reasonix without going through Operit AI."
            },
            "parameters": []
        }
    ]
}*/

const reasonixBridge = (function () {
    const REASONIX_PATH = "/usr/bin/reasonix";
    let lastUpdateCheckTime = 0;
    const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

    // ── 终端命令辅助 ──
    async function termExec(cmd, timeout) {
        return Tools.System.terminal.hiddenExec(cmd, {
            executorKey: "reasonix_bridge",
            timeoutMs: timeout || 10000
        });
    }

    // ── 检查 reasonix 是否已安装 ──
    async function checkReasonix() {
        const r = await termExec(`which reasonix 2>/dev/null && reasonix version 2>&1 || echo "NOT_FOUND"`, 5000);
        if (!r || !r.output || r.output.includes("NOT_FOUND")) return { installed: false };
        return { installed: true, version: r.output.replace(/^reasonix\s*/i, "").trim() };
    }

    // ── 版本更新检查（每天最多一次） ──
    async function checkForUpdate() {
        const now = Date.now();
        if (now - lastUpdateCheckTime < UPDATE_CHECK_INTERVAL_MS) return null;
        lastUpdateCheckTime = now;
        try {
            const r = await termExec(`reasonix upgrade --check 2>&1`, 15000);
            if (!r || !r.output) return null;
            const isLatest = r.output.trim().includes("Already on the latest");
            return { hasUpdate: !isLatest, detail: isLatest ? null : r.output.trim() };
        } catch (e) { return null; }
    }

    // ── 确保 reasonix serve 在后台运行（供 reasonix_open 使用） ──
    async function ensureServe() {
        const check = await termExec(`curl -s -o /dev/null -w '%{http_code}' --max-time 2 http://127.0.0.1:8787/ 2>/dev/null || echo "DOWN"`, 5000);
        if (check && check.output && check.output.trim() === "200") return { running: true };

        const status = await checkReasonix();
        if (!status.installed) return { running: false, notInstalled: true, installCommand: "npm i -g reasonix" };

        await termExec(`reasonix serve -addr 0.0.0.0:8787 -auth none > /dev/null 2>&1 &`, 3000);
        for (let i = 0; i < 15; i++) {
            const r2 = await termExec(`curl -s -o /dev/null -w '%{http_code}' --max-time 1 http://127.0.0.1:8787/ 2>/dev/null || echo "DOWN"`, 3000);
            if (r2 && r2.output && r2.output.trim() === "200") return { running: true, version: status.version };
            await Tools.System.sleep(1000);
        }
        return { running: false, error: "Reasonix Serve 启动超时" };
    }

    // ── 通过终端命令直接调用 reasonix，返回原始输出 ──
    async function callReasonix(input, timeoutMs) {
        const status = await checkReasonix();
        if (!status.installed) {
            return { notInstalled: true, installCommand: "npm i -g reasonix", error: "Reasonix 未安装。请执行 `npm i -g reasonix`" };
        }

        const updateInfo = await checkForUpdate();

        const cmd = `${REASONIX_PATH} -p ${JSON.stringify(input)} --output-format text 2>&1`;
        const result = await termExec(cmd, Math.max(timeoutMs, 30000));

        if (!result || result.exitCode !== 0) {
            const errMsg = result ? (result.output || `exit code: ${result.exitCode}`) : "无响应";
            return { error: `Reasonix 执行失败: ${errMsg}` };
        }

        const lines = (result.output || "").split("\n").filter(line => {
            const t = line.trim();
            if (!t) return false;
            if (t.startsWith("root@") || t.startsWith("$ ")) return false;
            if (t.includes("warning:") && t.includes("sandbox")) return false;
            return true;
        });
        const answer = lines.join("\n").trim();

        const response = { answer };
        if (updateInfo && updateInfo.hasUpdate) {
            response.updateAvailable = true;
            response.currentVersion = status.version;
            response.updateDetail = updateInfo.detail;
        }
        return response;
    }

    async function reasonix_ask(params) {
        const { query, timeoutMs } = params || {};
        if (!query || query.trim() === "") return { success: false, error: "query 不能为空" };
        try {
            const result = await callReasonix(query.trim(), parseInt(timeoutMs || "120000", 10));
            if (result.notInstalled) return { success: false, notInstalled: true, installCommand: result.installCommand, error: result.error };
            if (result.error) return { success: false, error: result.error };
            return { success: true, data: { answer: result.answer, updateAvailable: result.updateAvailable, currentVersion: result.currentVersion, updateDetail: result.updateDetail } };
        } catch (e) {
            return { success: false, error: `Reasonix 调用失败: ${e.message || e}` };
        }
    }

    async function reasonix_task(params) {
        const { task, timeoutMs } = params || {};
        if (!task || task.trim() === "") return { success: false, error: "task 不能为空" };
        try {
            const result = await callReasonix(task.trim(), parseInt(timeoutMs || "180000", 10));
            if (result.notInstalled) return { success: false, notInstalled: true, installCommand: result.installCommand, error: result.error };
            if (result.error) return { success: false, error: result.error };
            return { success: true, data: { answer: result.answer, updateAvailable: result.updateAvailable, currentVersion: result.currentVersion, updateDetail: result.updateDetail } };
        } catch (e) {
            return { success: false, error: `Reasonix 调用失败: ${e.message || e}` };
        }
    }

    async function reasonix_open() {
        try {
            const serve = await ensureServe();
            if (!serve.running) {
                if (serve.notInstalled) return { success: false, notInstalled: true, installCommand: "npm i -g reasonix", message: "Reasonix 未安装。请先执行 `npm i -g reasonix`" };
                return { success: false, message: serve.error || "无法启动 Reasonix Serve" };
            }
            return {
                success: true,
                data: {
                    message: "✅ Reasonix Web UI 已就绪！请通过浏览器打开 http://127.0.0.1:8787/ 直接与 Reasonix 对话。",
                    url: "http://127.0.0.1:8787/",
                    version: serve.version || "unknown"
                }
            };
        } catch (e) {
            return { success: false, message: `打开失败: ${e.message || e}` };
        }
    }

    return { reasonix_ask, reasonix_task, reasonix_open };
})();

exports.reasonix_ask = reasonixBridge.reasonix_ask;
exports.reasonix_task = reasonixBridge.reasonix_task;
exports.reasonix_open = reasonixBridge.reasonix_open;