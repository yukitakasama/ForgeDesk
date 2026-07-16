import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertTriangle,
  Check,
  Clock3,
  ShieldAlert,
  X,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";

export default function ApprovalDialog() {
  const approval = useAppStore((state) => state.approvals[0]);
  const resolveApproval = useAppStore((state) => state.resolveApproval);

  return (
    <Dialog.Root open={Boolean(approval)}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        {approval && (
          <Dialog.Content className="approval-dialog">
            <div className="approval-icon">
              <ShieldAlert size={22} />
            </div>
            <Dialog.Title>Codex 请求批准</Dialog.Title>
            <Dialog.Description>
              请确认此操作与当前任务目标一致。拒绝不会终止整个任务。
            </Dialog.Description>
            <div className="approval-summary">
              <div>
                <span>操作</span>
                <strong>
                  {approval.method.includes("fileChange")
                    ? "修改项目文件"
                    : approval.method.includes("permissions")
                      ? "提升执行权限"
                      : "运行命令"}
                </strong>
              </div>
              {approval.cwd && (
                <div>
                  <span>目录</span>
                  <code>{approval.cwd}</code>
                </div>
              )}
              {approval.command && (
                <pre>
                  <code>{approval.command}</code>
                </pre>
              )}
              {approval.reason && (
                <div className="approval-reason">
                  <AlertTriangle size={14} />
                  {approval.reason}
                </div>
              )}
            </div>
            <div className="approval-actions">
              <button
                className="secondary"
                onClick={() =>
                  void resolveApproval(approval, "decline")
                }
              >
                <X size={15} />
                拒绝
              </button>
              <button
                className="secondary"
                onClick={() =>
                  void resolveApproval(approval, "acceptForSession")
                }
              >
                <Clock3 size={15} />
                本次会话允许
              </button>
              <button
                className="primary"
                onClick={() => void resolveApproval(approval, "accept")}
              >
                <Check size={15} />
                允许一次
              </button>
            </div>
          </Dialog.Content>
        )}
      </Dialog.Portal>
    </Dialog.Root>
  );
}
