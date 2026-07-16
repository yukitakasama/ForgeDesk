import {
  Blocks,
  Cable,
  CheckCircle2,
  PackageOpen,
  ScrollText,
  Wrench,
} from "lucide-react";
import { useEffect, useState } from "react";
import { codexRequest } from "../lib/bridge";
import { useAppStore } from "../store/useAppStore";

export default function ExtensionsView() {
  const projects = useAppStore((state) => state.projects);
  const selectedProjectId = useAppStore((state) => state.selectedProjectId);
  const experimental = useAppStore(
    (state) => state.capabilities.experimentalProtocol,
  );
  const [counts, setCounts] = useState({
    mcp: 0,
    plugins: 0,
    skills: 0,
    hooks: 0,
    apps: 0,
  });
  const [loading, setLoading] = useState(true);
  const cwd = projects.find((item) => item.id === selectedProjectId)?.root;

  useEffect(() => {
    let active = true;
    setLoading(true);
    const requests = [
      codexRequest<{ data?: unknown[] }>("mcpServerStatus/list", {
        limit: 100,
        detail: "summary",
      }),
      codexRequest<{ marketplaces?: Array<{ plugins?: unknown[] }> }>(
        "plugin/list",
        { cwds: cwd ? [cwd] : [] },
      ),
      codexRequest<{ data?: unknown[] }>("skills/list", {
        cwds: cwd ? [cwd] : [],
      }),
      codexRequest<{ data?: unknown[] }>("hooks/list", {
        cwds: cwd ? [cwd] : [],
      }),
      experimental
        ? codexRequest<{ data?: unknown[] }>("app/list", { limit: 100 })
        : Promise.resolve({ data: [] }),
    ];
    void Promise.allSettled(requests).then((results) => {
      if (!active) return;
      const dataResult = (index: number) => {
        const result = results[index];
        return result.status === "fulfilled"
          ? (result.value as { data?: unknown[] })
          : undefined;
      };
      const pluginResult =
        results[1].status === "fulfilled"
          ? (results[1].value as {
              marketplaces?: Array<{ plugins?: unknown[] }>;
            })
          : undefined;
      const marketplaces = pluginResult?.marketplaces || [];
      setCounts({
        mcp: dataResult(0)?.data?.length || 0,
        plugins: marketplaces.reduce(
          (total: number, market: { plugins?: unknown[] }) =>
            total + (market.plugins?.length || 0),
          0,
        ),
        skills: dataResult(2)?.data?.length || 0,
        hooks: dataResult(3)?.data?.length || 0,
        apps: dataResult(4)?.data?.length || 0,
      });
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [cwd, experimental]);

  const groups = [
    {
      icon: <Cable size={18} />,
      title: "MCP Servers",
      copy: "连接外部数据、工具和授权服务。",
      status: `${counts.mcp} 个已发现`,
    },
    {
      icon: <PackageOpen size={18} />,
      title: "Plugins",
      copy: "安装包含 Skills、Hooks、MCP 和资源的扩展包。",
      status: `${counts.plugins} 个可用`,
    },
    {
      icon: <Wrench size={18} />,
      title: "Skills",
      copy: "发现并管理本地与项目级工作流。",
      status: `${counts.skills} 个已加载`,
    },
    {
      icon: <ScrollText size={18} />,
      title: "Hooks",
      copy: "检查生命周期钩子的来源、信任状态和执行结果。",
      status: `${counts.hooks} 组配置`,
    },
    ...(experimental
      ? [
          {
            icon: <Blocks size={18} />,
            title: "Apps",
            copy: "使用实验 app-server API 列出可用连接器。",
            status: `${counts.apps} 个可用`,
          },
        ]
      : []),
  ];

  return (
    <div className="surface-page">
      <header className="surface-header">
        <div>
          <span className="eyebrow">Codex 生态</span>
          <h1>扩展</h1>
          <p>从统一界面管理 MCP、Plugins、Skills、Hooks 和 Apps。</p>
        </div>
      </header>
      <div className="extension-list">
        {groups.map((group) => (
          <article key={group.title}>
            <div className="extension-icon">{group.icon}</div>
            <div>
              <h2>{group.title}</h2>
              <p>{group.copy}</p>
            </div>
            <span>
              <CheckCircle2 size={14} />
              {loading ? "正在读取" : group.status}
            </span>
            <button title={`打开 ${group.title}`}>
              <Blocks size={16} />
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
