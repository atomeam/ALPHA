import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import * as LucideIcons from 'lucide-react';
import { RefreshCcw, Zap } from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ComponentType, SVGProps } from 'react';
import { cn } from './lib/utils.js';

export type PrimitiveType =
  | 'card'
  | 'stat'
  | 'chart'
  | 'list'
  | 'info'
  | 'alert'
  | 'status'
  | 'action';

export type ChartDatum = {
  name?: string;
  value?: number;
} & Record<string, unknown>;

export interface PrimitiveProps {
  value?: string;
  label?: string;
  description?: string;
  icon?: string;
  data?: ChartDatum[];
  items?: string[];
  color?: string;
  actionLabel?: string;
  command?: string;
  discoveryHash?: string;
}

export interface ComponentSpec {
  id: string;
  type: PrimitiveType;
  title: string;
  props: PrimitiveProps;
}

export interface PrimitiveTheme {
  border?: 'glass' | 'sharp' | 'rounded';
  primary?: string;
  font?: 'Mono' | 'Serif' | 'Sans';
}

export interface PrimitiveRendererProps {
  spec: ComponentSpec;
  theme?: PrimitiveTheme;
  onAction?: (command: string) => void;
}

type LucideIconComponent = ComponentType<SVGProps<SVGSVGElement>>;
const lucideRegistry = LucideIcons as unknown as Record<string, LucideIconComponent | undefined>;

const IconWrapper = ({ name, className }: { name?: string; className?: string }) => {
  if (!name) return null;
  const Icon = lucideRegistry[name] ?? LucideIcons.HelpCircle;
  return <Icon className={className ?? 'w-4 h-4'} />;
};

export const PrimitiveRenderer = ({ spec, theme, onAction }: PrimitiveRendererProps) => {
  const { type, title, props } = spec;
  const borderClass =
    theme?.border === 'glass'
      ? 'border-glass rounded-3xl backdrop-blur-xl bg-white/[0.02]'
      : theme?.border === 'sharp'
        ? 'border-sharp'
        : 'border-rounded rounded-xl';
  const accentColor = theme?.primary ?? '#c4a661';

  const Title = ({ children, icon }: { children: ReactNode; icon?: string }) => (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 rotate-45" style={{ backgroundColor: accentColor }}></div>
        <h3
          className={cn(
            'text-[10px] font-bold uppercase tracking-[0.25em] opacity-40',
            theme?.font === 'Mono'
              ? 'font-mono'
              : theme?.font === 'Serif'
                ? 'font-serif'
                : 'font-sans',
          )}
        >
          {children}
        </h3>
      </div>
      <IconWrapper name={icon} className="opacity-20 group-hover:opacity-60 transition-opacity" />
    </div>
  );

  switch (type) {
    case 'stat':
      return (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'p-6 border border-white/5 shadow-2xl hover:border-gold/30 transition-all group relative overflow-hidden',
            borderClass,
            theme?.border !== 'glass' && 'bg-black/20',
          )}
        >
          <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity pointer-events-none">
            <IconWrapper name={props.icon} className="w-24 h-24" />
          </div>
          <Title icon={props.icon}>{title}</Title>
          <div className="flex flex-col gap-1 relative z-10">
            <span className="text-4xl font-light tracking-tighter text-white/90 font-serif">
              {props.value}
            </span>
            <span className="text-[10px] text-white/20 uppercase tracking-[0.3em] font-mono">
              {props.label}
            </span>
          </div>
          {props.description && (
            <p className="mt-4 text-[10px] text-white/30 italic font-light leading-relaxed border-l border-white/5 pl-3">
              {props.description}
            </p>
          )}
          <motion.div
            animate={{ top: ['0%', '100%', '0%'] }}
            transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
            className="absolute left-0 right-0 h-[1px] bg-white/[0.02] z-0"
          />
        </motion.div>
      );

    case 'chart':
      return (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className={cn(
            'p-6 border border-white/5 shadow-2xl md:col-span-2 relative overflow-hidden',
            borderClass,
            theme?.border !== 'glass' && 'bg-black/20',
          )}
        >
          <Title icon={props.icon}>{title}</Title>
          <div className="h-[200px] w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              {props.color === 'line' ? (
                <LineChart data={props.data}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="rgba(255,255,255,0.03)"
                  />
                  <XAxis dataKey="name" hide />
                  <YAxis hide domain={['auto', 'auto']} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#050505',
                      border: '1px solid rgba(255,255,255,0.1)',
                      fontSize: '10px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                    }}
                    itemStyle={{ color: accentColor }}
                    cursor={{ stroke: 'rgba(255,255,255,0.1)' }}
                  />
                  <Line
                    type="stepAfter"
                    dataKey="value"
                    stroke={accentColor}
                    strokeWidth={1.5}
                    dot={false}
                    activeDot={{ r: 4, fill: accentColor, strokeWidth: 0 }}
                  />
                </LineChart>
              ) : props.color === 'area' ? (
                <AreaChart data={props.data}>
                  <defs>
                    <linearGradient id={`grad-${spec.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={accentColor} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={accentColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#050505',
                      border: '1px solid rgba(255,255,255,0.1)',
                      fontSize: '10px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={accentColor}
                    fillOpacity={1}
                    fill={`url(#grad-${spec.id})`}
                    strokeWidth={1}
                  />
                </AreaChart>
              ) : (
                <BarChart data={props.data}>
                  <Bar dataKey="value" fill={accentColor} radius={[1, 1, 0, 0]} opacity={0.6} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#050505',
                      border: '1px solid rgba(255,255,255,0.1)',
                      fontSize: '10px',
                    }}
                  />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
          <div className="absolute bottom-4 right-6 text-[8px] font-mono text-white/10 uppercase tracking-widest">
            Neural_Telemetry_V3
          </div>
        </motion.div>
      );

    case 'list':
      return (
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className={cn(
            'p-6 border border-white/5 shadow-2xl',
            borderClass,
            theme?.border !== 'glass' && 'bg-black/20',
          )}
        >
          <Title icon={props.icon}>{title}</Title>
          <div className="space-y-4">
            {props.items?.map((item, i) => (
              <div key={`${spec.id}-item-${i}`} className="flex items-center gap-4 group/item">
                <div className="text-[9px] font-mono opacity-20 group-hover/item:opacity-60 transition-opacity">
                  {(i + 1).toString().padStart(2, '0')}
                </div>
                <div className="flex-1 border-b border-white/5 pb-2 group-hover/item:border-white/10 transition-colors">
                  <span className="text-[11px] text-white/50 group-hover/item:text-white/90 transition-colors font-light tracking-wide uppercase">
                    {item}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      );

    case 'status':
      return (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'p-6 border border-white/5 flex flex-col gap-4 group transition-all relative overflow-hidden',
            borderClass,
            theme?.border !== 'glass' && 'bg-black/20',
          )}
        >
          <Title icon={props.icon}>{title}</Title>
          <div className="flex items-center gap-6">
            <div className="relative">
              <div className="w-14 h-14 rounded-full border border-white/5 flex items-center justify-center">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
                  className="absolute inset-0 border border-t-white/20 border-r-transparent border-b-transparent border-l-transparent rounded-full"
                />
                <RefreshCcw className="w-5 h-5 text-white/20 animate-spin-slow" />
              </div>
            </div>
            <div className="flex flex-col">
              <span className="text-3xl font-mono text-white/90 leading-none tracking-tighter">
                {props.value}
              </span>
              <span className="text-[9px] font-bold text-white/20 uppercase tracking-[0.2em] mt-1">
                {props.label}
              </span>
            </div>
          </div>
          <div className="h-[1px] w-full bg-white/5 relative mt-2">
            <motion.div
              animate={{ left: ['-20%', '120%'] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute top-0 bottom-0 w-12 bg-gradient-to-r from-transparent via-white/20 to-transparent"
            />
          </div>
        </motion.div>
      );

    case 'action':
      return (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'p-6 border border-white/5 flex flex-col gap-4 group transition-all relative overflow-hidden',
            borderClass,
            theme?.border !== 'glass' && 'bg-black/20',
          )}
        >
          <Title icon={props.icon}>{title}</Title>
          <p className="text-[11px] text-white/40 leading-relaxed font-light mb-2">
            {props.description}
          </p>
          <button
            onClick={() => onAction?.(props.command ?? 'INTERNAL_SYNC')}
            className="w-full py-3 border border-gold/40 text-gold bg-gold/5 flex items-center justify-center gap-2 text-[10px] uppercase font-mono tracking-[0.2em] hover:bg-gold hover:text-black transition-all cursor-pointer group/btn"
          >
            <Zap className="w-3 h-3 group-hover/btn:animate-pulse" />
            {props.actionLabel ?? 'Execute Command'}
          </button>

          <div className="absolute bottom-1 right-2 text-[6px] font-mono opacity-10 tracking-[0.3em]">
            AUTH_LEVEL_01://RECURSIVE_CMD
          </div>
        </motion.div>
      );

    case 'alert':
      return (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className={cn(
            'p-6 border border-red-500/10 flex flex-col gap-3 bg-red-500/[0.03]',
            borderClass,
          )}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <LucideIcons.AlertTriangle className="w-4 h-4 text-red-500 animate-pulse" />
              <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest">
                {title}
              </span>
            </div>
            <span className="text-[8px] font-mono text-red-500/40">CRITICAL_V_SYS</span>
          </div>
          <p className="text-[11px] text-red-200/40 leading-relaxed font-light italic">
            {props.description}
          </p>
          <div className="h-1 bg-red-500/10 w-full overflow-hidden mt-2">
            <motion.div
              animate={{ width: ['0%', '100%', '0%'] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="h-full bg-red-500/50"
            />
          </div>
        </motion.div>
      );

    case 'card':
    case 'info':
    default:
      return (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'p-6 border border-white/5 shadow-2xl group hover:border-gold/20 transition-all bg-black/10',
            borderClass,
          )}
        >
          <Title icon={props.icon}>{title}</Title>
          <p className="text-[11px] text-white/40 leading-relaxed font-light tracking-wide italic border-l border-white/5 pl-4">
            {props.description ??
              'System initialized at root level. Recursive architectural memory engaged.'}
          </p>
        </motion.div>
      );
  }
};
