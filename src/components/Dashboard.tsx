import React, { useMemo } from 'react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  LineChart,
  Line
} from 'recharts';
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { ShiftClosure, Movement } from '../types';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Users, 
  Calendar,
  ArrowLeft,
  PieChart as PieChartIcon,
  BarChart3
} from 'lucide-react';
import { motion } from 'motion/react';

interface DashboardProps {
  closures: ShiftClosure[];
  movements: Movement[];
  onBack: () => void;
}

const COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#6366F1', '#F43F5E', '#84CC16'];

export function Dashboard({ closures, movements, onBack }: DashboardProps) {
  // 1. Gastos por Categoría (Outflows)
  const expensesByCategory = useMemo(() => {
    const data: Record<string, number> = {};
    movements
      .filter(m => m.type === 'outflow')
      .forEach(m => {
        const cat = m.category || 'Otros';
        data[cat] = (data[cat] || 0) + m.amount;
      });
    
    return Object.entries(data)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [movements]);

  // 2. Ingresos por Día (Últimos 30 días)
  const dailyIncome = useMemo(() => {
    const data: Record<string, number> = {};
    closures.forEach(c => {
      const day = format(parseISO(c.date), 'dd/MM');
      data[day] = (data[day] || 0) + c.physicalAmount;
    });
    
    return Object.entries(data)
      .map(([name, income]) => ({ name, income }))
      .slice(-15); // Mostrar últimos 15 días con datos
  }, [closures]);

  // 3. Ingresos por Mes
  const monthlyIncome = useMemo(() => {
    const data: Record<string, number> = {};
    closures.forEach(c => {
      const month = format(parseISO(c.date), 'MMMM yyyy', { locale: es });
      data[month] = (data[month] || 0) + c.physicalAmount;
    });
    
    return Object.entries(data)
      .map(([name, income]) => ({ name, income }));
  }, [closures]);

  // 4. Ingresos por Cajero (Responsable)
  const incomeByCashier = useMemo(() => {
    const data: Record<string, number> = {};
    closures.forEach(c => {
      const name = c.responsible || 'Desconocido';
      data[name] = (data[name] || 0) + c.physicalAmount;
    });
    
    return Object.entries(data)
      .map(([name, income]) => ({ name, income }))
      .sort((a, b) => b.income - a.income);
  }, [closures]);

  const totalExpenses = expensesByCategory.reduce((acc, curr) => acc + curr.value, 0);
  const totalIncome = closures.reduce((acc, curr) => acc + curr.physicalAmount, 0);

  return (
    <div className="min-h-screen bg-[#0F172A] text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button 
              onClick={onBack}
              className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-all text-slate-400 hover:text-white"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-3xl font-black tracking-tight">Dashboard de Reportes</h1>
              <p className="text-slate-400">Análisis detallado de ingresos y gastos.</p>
            </div>
          </div>
          
          <div className="flex gap-4">
            <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl">
              <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Total Ingresos</p>
              <p className="text-2xl font-black font-mono text-emerald-400">${totalIncome.toLocaleString('es-CL')}</p>
            </div>
            <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-2xl">
              <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-1">Total Gastos</p>
              <p className="text-2xl font-black font-mono text-rose-400">${totalExpenses.toLocaleString('es-CL')}</p>
            </div>
          </div>
        </div>

        {/* Charts Grid */}
        {closures.length === 0 && movements.length === 0 ? (
          <div className="bg-[#1E293B]/50 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-20 text-center">
            <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
              <BarChart3 className="w-10 h-10 text-slate-500" />
            </div>
            <h3 className="text-2xl font-black text-white mb-2">Sin datos suficientes</h3>
            <p className="text-slate-400">Registra cierres y movimientos para ver las estadísticas aquí.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* ... rest of the grid ... */}
          
          {/* Gastos por Categoría */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#1E293B]/50 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-8"
          >
            <div className="flex items-center gap-3 mb-8">
              <div className="p-2 bg-rose-500/10 rounded-xl">
                <PieChartIcon className="w-5 h-5 text-rose-400" />
              </div>
              <h3 className="text-xl font-black">Gastos por Categoría</h3>
            </div>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expensesByCategory}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {expensesByCategory.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1E293B', border: 'none', borderRadius: '12px', color: '#fff' }}
                    formatter={(value: number) => `$${value.toLocaleString('es-CL')}`}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          {/* Ingresos por Cajero */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-[#1E293B]/50 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-8"
          >
            <div className="flex items-center gap-3 mb-8">
              <div className="p-2 bg-blue-500/10 rounded-xl">
                <Users className="w-5 h-5 text-blue-400" />
              </div>
              <h3 className="text-xl font-black">Ingresos por Cajero</h3>
            </div>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={incomeByCashier} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={12} width={100} />
                  <Tooltip 
                    cursor={{ fill: '#ffffff05' }}
                    contentStyle={{ backgroundColor: '#1E293B', border: 'none', borderRadius: '12px', color: '#fff' }}
                    formatter={(value: number) => `$${value.toLocaleString('es-CL')}`}
                  />
                  <Bar dataKey="income" fill="#3B82F6" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          {/* Ingresos Diarios */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-[#1E293B]/50 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-8 lg:col-span-2"
          >
            <div className="flex items-center gap-3 mb-8">
              <div className="p-2 bg-emerald-500/10 rounded-xl">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
              </div>
              <h3 className="text-xl font-black">Ingresos Diarios (Últimos 15 días con actividad)</h3>
            </div>
            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyIncome}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(val) => `$${(val/1000)}k`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1E293B', border: 'none', borderRadius: '12px', color: '#fff' }}
                    formatter={(value: number) => `$${value.toLocaleString('es-CL')}`}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="income" 
                    stroke="#10B981" 
                    strokeWidth={4} 
                    dot={{ r: 6, fill: '#10B981', strokeWidth: 2, stroke: '#fff' }}
                    activeDot={{ r: 8 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          {/* Ingresos Mensuales */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-[#1E293B]/50 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-8 lg:col-span-2"
          >
            <div className="flex items-center gap-3 mb-8">
              <div className="p-2 bg-purple-500/10 rounded-xl">
                <Calendar className="w-5 h-5 text-purple-400" />
              </div>
              <h3 className="text-xl font-black">Balance Mensual</h3>
            </div>
            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyIncome}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(val) => `$${(val/1000000)}M`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1E293B', border: 'none', borderRadius: '12px', color: '#fff' }}
                    formatter={(value: number) => `$${value.toLocaleString('es-CL')}`}
                  />
                  <Bar dataKey="income" fill="#8B5CF6" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        </div>
        )}
      </div>
    </div>
  );
}
