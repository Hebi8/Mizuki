#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/output/gsc"
PROMPT_FILE="$ROOT_DIR/scripts/prompts/gsc-weekly-analysis.md"
LATEST_ANALYSIS_FILE="$OUTPUT_DIR/analysis/latest.md"

PNPM_BIN="${PNPM_BIN:-pnpm}"
CODEX_BIN="${CODEX_BIN:-codex}"
CODEX_MODEL="${GSC_CODEX_MODEL:-gpt-6-sol}"

status() {
	node --input-type=module - "$OUTPUT_DIR" "$1" "${STAGE:-startup}" \
		"${RUN_LOG:-}" "${WEEK_LABEL:-}" "${ANALYSIS_FILE:-}" "${2:-0}" <<'NODE'
import fs from "node:fs";
import path from "node:path";

const [dir, action, stage, logFile, week, analysisFile, exitCode] = process.argv.slice(2);
const file = path.join(dir, "status.json");
let previous = {};
try {
	previous = JSON.parse(fs.readFileSync(file, "utf8"));
} catch (error) {
	if (error.code !== "ENOENT") throw error;
}

if (action === "check") {
	const stale = Date.now() - Date.parse(previous.updatedAt) > 8 * 86400000;
	const current = stale ? "stale" : previous.status || "missing";
	console.log(JSON.stringify({ ...previous, status: current }, null, 2));
	process.exit(current === "success" ? 0 : 1);
}

const now = new Date().toISOString();
const state = {
	status: action,
	updatedAt: now,
	stage,
	week,
	logFile,
	exitCode: Number(exitCode),
	lastSuccessAt: action === "success" ? now : previous.lastSuccessAt || null,
	lastSuccessFile: action === "success" ? analysisFile : previous.lastSuccessFile || null,
};
fs.writeFileSync(`${file}.tmp`, `${JSON.stringify(state, null, 2)}\n`);
fs.renameSync(`${file}.tmp`, file);

if (action !== "success") {
	const latest = path.join(dir, "analysis/latest.md");
	const lines = [
		"# GSC 内容周报分析",
		"",
		`> ${action === "failed" ? "本次运行失败，尚无本次分析结果。" : "正在运行，尚无本次分析结果。"}`,
		"",
		`- 更新时间：${now}`,
		`- 阶段：${stage}`,
		`- 周次：${week || "待获取"}`,
		`- 退出码：${exitCode}`,
		`- 运行日志：${logFile}`,
		`- 上次成功：${state.lastSuccessAt || "请查看 analysis 目录中的历史周报"}`,
		...(state.lastSuccessFile ? [`- 上次分析：${state.lastSuccessFile}`] : []),
	];
	fs.writeFileSync(`${latest}.tmp`, `${lines.join("\n")}\n`);
	fs.renameSync(`${latest}.tmp`, latest);
}
NODE
}

if [ "${1:-}" = "--status" ]; then
	status check
	exit
fi

cd "$ROOT_DIR"

if [ "${DRY_RUN:-}" = "1" ]; then
	echo "Would run: $PNPM_BIN gsc:weekly"
	echo "Would run: $CODEX_BIN -a never exec --ignore-user-config -m $CODEX_MODEL -C $ROOT_DIR -s read-only -o <analysis-file> - < $PROMPT_FILE"
	exit 0
fi

mkdir -p "$OUTPUT_DIR/logs" "$OUTPUT_DIR/analysis"
exec 9> "$OUTPUT_DIR/.weekly-analysis.flock"
if ! flock -n 9; then
	echo "GSC weekly Codex analysis is already running."
	exit 0
fi

RUN_LOG="$OUTPUT_DIR/logs/run-$(date -u +%Y%m%dT%H%M%SZ).log"
TEMP_ANALYSIS="$OUTPUT_DIR/analysis/.pending.md"
STAGE="report"
exec 3>&1
exec >> "$RUN_LOG" 2>&1

cleanup() {
	local result=$?
	trap - EXIT
	if [ "$result" -ne 0 ]; then
		status failed "$result" || true
		echo "GSC weekly analysis failed at $STAGE (exit $result). See $RUN_LOG" >&3
	fi
	rm -f "$TEMP_ANALYSIS" "$LATEST_ANALYSIS_FILE.tmp"
	exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

rm -f "$TEMP_ANALYSIS"
status running
echo "[$(date -Is)] Starting GSC weekly report refresh"
"$PNPM_BIN" gsc:weekly

WEEK_LABEL="$(
	sed -n 's/^# GSC Weekly Report - //p' "$OUTPUT_DIR/latest.md" | head -n 1
)"
if [ -z "$WEEK_LABEL" ]; then
	echo "Missing week label in GSC report"
	exit 1
fi

ANALYSIS_FILE="$OUTPUT_DIR/analysis/$WEEK_LABEL.md"
STAGE="analysis"
status running

echo "[$(date -Is)] Starting Codex analysis for $WEEK_LABEL"
"$CODEX_BIN" --version
"$CODEX_BIN" -a never exec \
	--ignore-user-config \
	-m "$CODEX_MODEL" \
	-c 'model_reasoning_effort="medium"' \
	-C "$ROOT_DIR" \
	-s read-only \
	-o "$TEMP_ANALYSIS" \
	- < "$PROMPT_FILE"
if [ ! -s "$TEMP_ANALYSIS" ]; then
	echo "Codex returned no analysis"
	exit 1
fi

STAGE="publish"
{
	printf '> 分析生成时间：%s；周次：%s。\n> 使用 pnpm gsc:status 检查状态；超过 8 天未更新会标为 stale。\n\n' "$(date -u +%FT%TZ)" "$WEEK_LABEL"
	cat "$TEMP_ANALYSIS"
} > "$LATEST_ANALYSIS_FILE.tmp"
mv "$LATEST_ANALYSIS_FILE.tmp" "$ANALYSIS_FILE"
cp "$ANALYSIS_FILE" "$LATEST_ANALYSIS_FILE.tmp"
mv "$LATEST_ANALYSIS_FILE.tmp" "$LATEST_ANALYSIS_FILE"
status success
echo "[$(date -Is)] Wrote $ANALYSIS_FILE"
echo "[$(date -Is)] Full log: $RUN_LOG"
echo "GSC weekly analysis succeeded for $WEEK_LABEL. See $ANALYSIS_FILE" >&3
