/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ShiftClosure, Movement, UserProfile } from './types';
import { ErrorBoundary } from './components/ErrorBoundary';
import { auth, db, signInWithGoogle, logOut, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import html2pdf from 'html2pdf.js';
import { 
  Plus, 
  LogOut, 
  History, 
  TrendingDown, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle2, 
  User as UserIcon,
  DollarSign,
  Calendar,
  Edit2,
  FileText,
  Wallet,
  Calculator,
  Moon,
  Sun,
  ArrowRight,
  Search,
  MessageSquare,
  Trash2,
  X,
  RefreshCw,
  Copy,
  CopyPlus,
  Check,
  Truck,
  ShieldCheck,
  ArrowUpRight,
  ArrowDownLeft,
  Building2,
  CreditCard,
  ArrowRightLeft,
  Tag,
  Printer,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Dashboard } from './components/Dashboard';
import { LayoutDashboard } from 'lucide-react';

function AppContent() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [closures, setClosures] = useState<ShiftClosure[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [isMigrating, setIsMigrating] = useState(false);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [currentView, setCurrentView] = useState<'main' | 'dashboard'>('main');

  const [categories, setCategories] = useState<string[]>(['Sueldos', 'Arriendo', 'Luz', 'Agua', 'Internet', 'Insumos', 'Otros']);
  const [isExporting, setIsExporting] = useState(false);
  const [isAddingNewCategory, setIsAddingNewCategory] = useState(false);
  const [isEditingCategories, setIsEditingCategories] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isAddingMovement, setIsAddingMovement] = useState(false);
  const [movementValues, setMovementValues] = useState<Partial<Movement>>({
    type: 'outflow',
    category: categories ? categories[0] : 'Otros',
    amount: 0,
    description: '',
    date: new Date().toISOString(),
    from: 'transit',
    to: 'safe'
  });
  const [isBulkEditing, setIsBulkEditing] = useState(false);
  const [bulkEditValues, setBulkEditValues] = useState<Record<string, Partial<ShiftClosure>>>({});
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});
  const [isInlineAdding, setIsInlineAdding] = useState(false);
  const [inlineAddValues, setInlineAddValues] = useState<Partial<ShiftClosure>>({
    responsible: '',
    systemAmount: 0,
    systemBalance: 0,
    physicalAmount: 0,
    status: 'safe',
    date: new Date().toISOString(),
    notes: ''
  });
  const [inlineEditingId, setInlineEditingId] = useState<string | null>(null);
  const [inlineEditValues, setInlineEditValues] = useState<Partial<ShiftClosure>>({});
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = async () => {
    if (!reportRef.current) return;
    
    const element = reportRef.current;
    const opt = {
      margin: 10,
      filename: `reporte-cierres-${format(new Date(), 'yyyy-MM-dd')}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    try {
      await (html2pdf() as any).set(opt).from(element).save();
    } catch (err) {
      console.error('Error generating PDF:', err);
      setPrintError('Error al generar el PDF. Intenta imprimir directamente.');
    }
  };

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Auth Listener
  useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
    try {
      if (firebaseUser) {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const userDoc = await getDoc(userRef);

        if (userDoc.exists()) {
          const userData = userDoc.data() as UserProfile & { categories?: string[] };
          setUser(userData);

          if (userData.categories) {
            setCategories(userData.categories);
          }
        } else {
          const newUser: UserProfile & { categories: string[] } = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            displayName: firebaseUser.displayName || '',
            role: firebaseUser.email === 'noop1226@gmail.com' ? 'admin' : 'user',
            categories: ['Sueldos', 'Arriendo', 'Luz', 'Agua', 'Internet', 'Insumos', 'Otros'],
          };

          await setDoc(userRef, newUser);
          setUser(newUser);
        }
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error('Error en onAuthStateChanged:', err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  });

  return () => unsubscribe();
}, []);

  // Firestore Listeners
  useEffect(() => {
    if (!user) {
      setClosures([]);
      setMovements([]);
      return;
    }

    const qClosures = query(collection(db, 'closures'), orderBy('date', 'desc'));
    const unsubscribeClosures = onSnapshot(qClosures, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
        date: (doc.data().date as Timestamp).toDate().toISOString()
      })) as ShiftClosure[];
      setClosures(data);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'closures'));

    const qMovements = query(collection(db, 'movements'), orderBy('date', 'desc'));
    const unsubscribeMovements = onSnapshot(qMovements, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
        date: (doc.data().date as Timestamp).toDate().toISOString()
      })) as Movement[];
      setMovements(data);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'movements'));

    return () => {
      unsubscribeClosures();
      unsubscribeMovements();
    };
  }, [user]);

  const handleMigrateData = async () => {
    if (!user) return;
    setIsMigrating(true);
    try {
      const localClosures = JSON.parse(localStorage.getItem('closures') || '[]');
      const localMovements = JSON.parse(localStorage.getItem('movements') || '[]');

      for (const c of localClosures) {
        const { id, ...data } = c;
        await addDoc(collection(db, 'closures'), {
          ...data,
          date: Timestamp.fromDate(new Date(c.date)),
          createdBy: user.uid
        });
      }

      for (const m of localMovements) {
        const { id, ...data } = m;
        await addDoc(collection(db, 'movements'), {
          ...data,
          date: Timestamp.fromDate(new Date(m.date)),
          createdBy: user.uid
        });
      }

      localStorage.removeItem('closures');
      localStorage.removeItem('movements');
      alert('Datos migrados exitosamente a la nube.');
    } catch (err) {
      console.error('Error migrando datos:', err);
      alert('Error al migrar datos. Revisa la consola.');
    } finally {
      setIsMigrating(false);
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim() || !user) return;
    
    if (categories.includes(newCategoryName.trim())) {
      setMovementValues({ ...movementValues, category: newCategoryName.trim() });
      setIsAddingNewCategory(false);
      setNewCategoryName('');
      return;
    }

    const updatedCategories = [...categories, newCategoryName.trim()];
    
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        categories: updatedCategories
      });
      setCategories(updatedCategories);
      setMovementValues({ ...movementValues, category: newCategoryName.trim() });
      setIsAddingNewCategory(false);
      setNewCategoryName('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const handleUpdateCategories = async (newCategories: string[]) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        categories: newCategories
      });
      setCategories(newCategories);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const handleExportCSV = () => {
    setIsExporting(true);
    try {
      const headers = ['Fecha', 'Responsable', 'Sistema', 'Cuadre', 'Fisico', 'Diferencia', 'Estado', 'Notas'];
      const rows = closures.map(c => [
        format(parseISO(c.date), 'yyyy-MM-dd HH:mm'),
        c.responsible,
        c.systemAmount,
        c.systemBalance || 0,
        c.physicalAmount,
        c.difference,
        c.status || 'safe',
        c.notes || ''
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(r => r.map(v => typeof v === 'string' ? `"${v.replace(/"/g, '""')}"` : v).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `cierres-export-${format(new Date(), 'yyyy-MM-dd')}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Error exporting CSV:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteMovement = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'movements', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `movements/${id}`);
    }
  };

  const openMovementForm = (type: 'outflow' | 'transfer') => {
    setMovementValues({
      type,
      category: type === 'outflow' ? categories[0] : undefined,
      amount: 0,
      description: '',
      date: new Date().toISOString()
    });
    setIsAddingMovement(true);
  };

  const getNextStatus = (current: string | undefined): 'safe' | 'transit' | 'bank' => {
    if (current === 'safe' || !current) return 'transit';
    if (current === 'transit') return 'bank';
    return 'safe';
  };

  const getStatusIcon = (status: string | undefined) => {
    if (status === 'bank') return <Building2 className="w-4 h-4" />;
    if (status === 'transit') return <Truck className="w-4 h-4" />;
    return <ShieldCheck className="w-4 h-4" />;
  };

  const getStatusColor = (status: string | undefined) => {
    if (status === 'bank') return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    if (status === 'transit') return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  };

  const getStatusLabel = (status: string | undefined) => {
    if (status === 'bank') return 'Banco';
    if (status === 'transit') return 'Tránsito';
    return 'Caja Fuerte';
  };

  const playSound = (status: string) => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      const frequencies: Record<string, number> = {
        'safe': 440,
        'transit': 554.37,
        'bank': 659.25
      };

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequencies[status] || 440, audioCtx.currentTime);
      
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.1);
    } catch (e) {
      console.warn('Audio not supported or blocked');
    }
  };

  const toggleBulkEdit = () => {
    if (isBulkEditing) {
      setIsBulkEditing(false);
      setBulkEditValues({});
    } else {
      setIsBulkEditing(true);
      const initialValues: Record<string, Partial<ShiftClosure>> = {};
      closures.forEach(c => {
        if (c.id) initialValues[c.id] = { ...c };
      });
      setBulkEditValues(initialValues);
      // Expand all days when bulk editing
      const allDays: Record<string, boolean> = {};
      filteredClosures.forEach(c => {
        allDays[format(parseISO(c.date), 'yyyy-MM-dd')] = true;
      });
      setExpandedDays(allDays);
    }
  };

  const handleDuplicate = async (closure: ShiftClosure) => {
    if (!user) return;
    try {
      const { id, ...data } = closure;
      // Preserve the original date of the record being duplicated
      const originalDate = parseISO(closure.date);
      await addDoc(collection(db, 'closures'), {
        ...data,
        date: Timestamp.fromDate(originalDate),
        createdBy: user.uid
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'closures/duplicate');
    }
  };

  const toggleDayStatus = async (date: string) => {
    if (!user) return;
    const closuresToUpdate = closures.filter(c => format(parseISO(c.date), 'yyyy-MM-dd') === date);
    if (closuresToUpdate.length === 0) return;

    const currentStatus = closuresToUpdate[0].status || 'safe';
    const nextStatus = getNextStatus(currentStatus);
    playSound(nextStatus);

    try {
      for (const c of closuresToUpdate) {
        if (c.id) {
          await updateDoc(doc(db, 'closures', c.id), { status: nextStatus });
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `closures/day/${date}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'closures', id));
      setDeleteConfirmId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `closures/${id}`);
    }
  };

  const handleEdit = (closure: ShiftClosure) => {
    setInlineEditingId(closure.id || null);
    setInlineEditValues({ ...closure });
  };

  const handleCancelInlineEdit = () => {
    setInlineEditingId(null);
    setInlineEditValues({});
  };

  const handleSaveInlineEdit = async () => {
    if (!inlineEditingId || !inlineEditValues.responsible || !user) return;

    const sys = typeof inlineEditValues.systemAmount === 'string' ? parseFloat(inlineEditValues.systemAmount) : inlineEditValues.systemAmount || 0;
    const phys = typeof inlineEditValues.physicalAmount === 'string' ? parseFloat(inlineEditValues.physicalAmount) : inlineEditValues.physicalAmount || 0;
    const diff = phys - sys;

    try {
      const { id, ...data } = inlineEditValues;
      await updateDoc(doc(db, 'closures', inlineEditingId), {
        ...data,
        systemAmount: sys,
        physicalAmount: phys,
        systemBalance: typeof inlineEditValues.systemBalance === 'string' ? parseFloat(inlineEditValues.systemBalance) : inlineEditValues.systemBalance || 0,
        difference: diff,
        date: Timestamp.fromDate(new Date(inlineEditValues.date!))
      });
      setInlineEditingId(null);
      setInlineEditValues({});
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `closures/${inlineEditingId}`);
    }
  };

  const handleSaveInlineAdd = async () => {
    if (!user || !inlineAddValues.responsible) return;

    const sys = typeof inlineAddValues.systemAmount === 'string' ? parseFloat(inlineAddValues.systemAmount) : inlineAddValues.systemAmount || 0;
    const phys = typeof inlineAddValues.physicalAmount === 'string' ? parseFloat(inlineAddValues.physicalAmount) : inlineAddValues.physicalAmount || 0;
    const diff = phys - sys;

    try {
      await addDoc(collection(db, 'closures'), {
        date: Timestamp.fromDate(new Date(inlineAddValues.date || new Date().toISOString())),
        responsible: inlineAddValues.responsible,
        systemAmount: sys,
        systemBalance: typeof inlineAddValues.systemBalance === 'string' ? parseFloat(inlineAddValues.systemBalance) : inlineAddValues.systemBalance || 0,
        physicalAmount: phys,
        difference: diff,
        notes: inlineAddValues.notes || '',
        status: (inlineAddValues.status || 'safe') as 'safe' | 'transit',
        createdBy: user.uid
      });
      setIsInlineAdding(false);
      setInlineAddValues({
        responsible: '',
        systemAmount: 0,
        systemBalance: 0,
        physicalAmount: 0,
        status: 'safe',
        date: new Date().toISOString(),
        notes: ''
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'closures');
    }
  };

  const handleSaveBulkEdit = async () => {
    if (!user) return;
    try {
      for (const id in bulkEditValues) {
        const editValues = bulkEditValues[id];
        const c = closures.find(item => item.id === id);
        if (!c) continue;

        const sys = typeof editValues.systemAmount === 'string' ? parseFloat(editValues.systemAmount) : (editValues.systemAmount ?? c.systemAmount);
        const phys = typeof editValues.physicalAmount === 'string' ? parseFloat(editValues.physicalAmount) : (editValues.physicalAmount ?? c.physicalAmount);
        const diff = phys - sys;

        await updateDoc(doc(db, 'closures', id), {
          ...editValues,
          systemAmount: sys,
          physicalAmount: phys,
          systemBalance: typeof editValues.systemBalance === 'string' ? parseFloat(editValues.systemBalance) : (editValues.systemBalance ?? c.systemBalance),
          difference: diff,
          date: editValues.date ? Timestamp.fromDate(new Date(editValues.date)) : Timestamp.fromDate(new Date(c.date))
        });
      }
      setIsBulkEditing(false);
      setBulkEditValues({});
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'closures/bulk');
    }
  };

  const handleSaveMovement = async () => {
    if (!user || !movementValues.amount || !movementValues.description) return;

    try {
      await addDoc(collection(db, 'movements'), {
        date: Timestamp.fromDate(new Date(movementValues.date || new Date().toISOString())),
        type: movementValues.type as 'outflow' | 'transfer' | 'internal_transfer',
        category: movementValues.type === 'outflow' ? movementValues.category : null,
        amount: typeof movementValues.amount === 'string' ? parseFloat(movementValues.amount) : movementValues.amount,
        description: movementValues.description,
        createdBy: user.uid,
        from: (movementValues.type === 'internal_transfer' || movementValues.type === 'transfer') ? movementValues.from : null,
        to: (movementValues.type === 'internal_transfer' || movementValues.type === 'transfer') ? movementValues.to : null
      });
      setIsAddingMovement(false);
      setMovementValues({
        type: 'outflow',
        category: categories[0],
        amount: 0,
        description: '',
        date: new Date().toISOString(),
        from: 'transit',
        to: 'safe'
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'movements');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, onSave: () => void) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSave();
    } else if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      const row = (e.target as HTMLElement).closest('tr');
      if (!row) return;
      
      // Get all focusable elements in the row
      const focusables = Array.from(row.querySelectorAll('input, select, button:not([disabled])')) as HTMLElement[];
      const index = focusables.indexOf(e.target as HTMLElement);
      
      if (index === -1) return;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        if (index < focusables.length - 1) {
          e.preventDefault();
          focusables[index + 1].focus();
          if (focusables[index + 1] instanceof HTMLInputElement) {
            (focusables[index + 1] as HTMLInputElement).select();
          }
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        if (index > 0) {
          e.preventDefault();
          focusables[index - 1].focus();
          if (focusables[index - 1] instanceof HTMLInputElement) {
            (focusables[index - 1] as HTMLInputElement).select();
          }
        }
      }
    }
  };

  const toggleStatus = async (id: string) => {
    if (!user) return;
    const closure = closures.find(c => c.id === id);
    if (!closure) return;

    const nextStatus = getNextStatus(closure.status);
    playSound(nextStatus);

    try {
      await updateDoc(doc(db, 'closures', id), {
        status: nextStatus
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `closures/${id}`);
    }
  };

  const filteredClosures = useMemo(() => {
    const term = debouncedSearchTerm.toLowerCase();
    if (!term) return closures;
    return closures.filter(c => 
      c.responsible.toLowerCase().includes(term) ||
      (c.notes && c.notes.toLowerCase().includes(term))
    );
  }, [closures, debouncedSearchTerm]);

  const groupedClosures = useMemo(() => {
    const groups: Record<string, { 
      date: string, 
      items: ShiftClosure[], 
      totals: { systemAmount: number, systemBalance: number, physicalAmount: number, difference: number } 
    }> = {};
    
    filteredClosures.forEach(closure => {
      const day = format(parseISO(closure.date), 'yyyy-MM-dd');
      if (!groups[day]) {
        groups[day] = {
          date: day,
          items: [],
          totals: { systemAmount: 0, systemBalance: 0, physicalAmount: 0, difference: 0 }
        };
      }
      groups[day].items.push(closure);
      groups[day].totals.systemAmount += closure.systemAmount;
      groups[day].totals.systemBalance += closure.systemBalance || 0;
      groups[day].totals.physicalAmount += closure.physicalAmount;
      groups[day].totals.difference += closure.difference;
    });

    return Object.values(groups).sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredClosures]);

  // Derive day statuses from closures
  const dayStatuses = useMemo(() => {
    const statuses: Record<string, string> = {};
    groupedClosures.forEach(group => {
      // If all items in the group have the same status, use that. Otherwise, use 'safe' as default.
      const firstStatus = group.items[0]?.status || 'safe';
      const allSame = group.items.every(item => (item.status || 'safe') === firstStatus);
      statuses[group.date] = allSame ? firstStatus : 'mixed';
    });
    return statuses;
  }, [groupedClosures]);

  const toggleDay = (day: string) => {
    setExpandedDays(prev => ({ ...prev, [day]: !prev[day] }));
  };

  const monthlyPhysicalTotal = useMemo(() => {
    const now = new Date();
    const start = startOfMonth(now);
    const end = endOfMonth(now);
    return closures
      .filter(c => isWithinInterval(parseISO(c.date), { start, end }))
      .reduce((acc, curr) => acc + curr.physicalAmount, 0);
  }, [closures]);

  const internalTransfers = useMemo(() => {
    return movements.filter(m => m.type === 'internal_transfer' || m.type === 'transfer');
  }, [movements]);

  const getInternalTransferBalance = (box: string) => {
    const incoming = internalTransfers
      .filter(m => m.to === box)
      .reduce((acc, curr) => acc + curr.amount, 0);
    const outgoing = internalTransfers
      .filter(m => m.from === box)
      .reduce((acc, curr) => acc + curr.amount, 0);
    return incoming - outgoing;
  };

  const accumulatedSafeTotal = useMemo(() => {
    const safeClosures = closures
      .filter(c => c.status === 'safe' || !c.status)
      .reduce((acc, curr) => acc + curr.physicalAmount, 0);
    return safeClosures + getInternalTransferBalance('safe');
  }, [closures, internalTransfers]);

  const accumulatedOutflowTotal = useMemo(() => {
    return movements
      .filter(m => m.type === 'outflow')
      .reduce((acc, curr) => acc + curr.amount, 0);
  }, [movements]);

  const transferMovementsTotal = useMemo(() => {
    return movements
      .filter(m => m.type === 'transfer')
      .reduce((acc, curr) => acc + curr.amount, 0);
  }, [movements]);

  const bankClosuresTotal = useMemo(() => {
    const bankClosures = closures
      .filter(c => c.status === 'bank')
      .reduce((acc, curr) => acc + curr.physicalAmount, 0);
    return bankClosures;
  }, [closures]);

  const accumulatedBankTotal = useMemo(() => {
    return bankClosuresTotal + getInternalTransferBalance('bank');
  }, [bankClosuresTotal, internalTransfers]);

  const accumulatedTransitTotal = useMemo(() => {
    const transitClosures = closures
      .filter(c => c.status === 'transit')
      .reduce((acc, curr) => acc + curr.physicalAmount, 0);
    
    return transitClosures - accumulatedOutflowTotal + getInternalTransferBalance('transit');
  }, [closures, accumulatedOutflowTotal, internalTransfers]);

  const uniqueResponsibles = useMemo(() => {
    const names = closures.map(c => c.responsible).filter(Boolean);
    return Array.from(new Set(names)).sort();
  }, [closures]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0F172A]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0F172A] p-4 relative overflow-hidden">
        {/* Decorative background elements */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 blur-[120px] rounded-full" />
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-[#1E293B]/80 backdrop-blur-xl rounded-[2.5rem] shadow-2xl p-10 text-center border border-white/10 relative z-10"
        >
          <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-blue-700 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-xl shadow-blue-500/20">
            <DollarSign className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-4xl font-black text-white mb-4 tracking-tight">CIERRES 1.0</h1>
          <p className="text-slate-400 mb-10 leading-relaxed text-lg">
            Gestiona tus cierres de caja en la nube de forma segura y colaborativa.
          </p>
          
          <button
            onClick={signInWithGoogle}
            className="w-full py-5 bg-white text-[#0F172A] rounded-2xl font-black text-lg hover:bg-slate-100 transition-all shadow-xl flex items-center justify-center gap-3 group"
          >
            <UserIcon className="w-6 h-6" />
            Ingresar con Google
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </motion.div>
      </div>
    );
  }

  if (currentView === 'dashboard') {
    return (
      <Dashboard 
        closures={closures} 
        movements={movements} 
        onBack={() => setCurrentView('main')} 
      />
    );
  }

  const totalDifference = closures.reduce((acc, curr) => acc + curr.difference, 0);
  
  const copyToClipboard = (closure: ShiftClosure) => {
    const date = parseISO(closure.date);
    const text = `Cierre de Caja - ${format(date, 'dd/MM/yyyy HH:mm')}
Responsable: ${closure.responsible}
Venta Sistema: $${closure.systemAmount.toLocaleString('es-CL')}
Cuadre Sistema: $${closure.systemBalance.toLocaleString('es-CL')}
Físico: $${closure.physicalAmount.toLocaleString('es-CL')}
Diferencia: $${closure.difference.toLocaleString('es-CL')}
Notas: ${closure.notes || 'N/A'}`;
    
    navigator.clipboard.writeText(text);
    // You could add a toast here if you had one
  };

  return (
    <>
      <div className={`min-h-screen bg-[#0F172A] text-slate-200 pb-20 selection:bg-blue-500/30 ${showPrintPreview ? 'hidden' : 'block'} print:hidden`}>
        {/* Header */}
      <header className="bg-[#1E293B]/50 backdrop-blur-md border-b border-white/5 sticky top-0 z-30">
        <div className="w-full px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Calculator className="text-white w-7 h-7" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white leading-none">CIERRES 1.0</h1>
              <p className="text-[10px] uppercase tracking-[0.2em] text-blue-400 font-bold mt-1">Accounting Suite</p>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="hidden lg:flex items-center gap-6 mr-4">
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Registros</span>
                <span className="text-sm font-black text-white font-mono">{closures.length}</span>
              </div>
              <div className="w-[1px] h-8 bg-white/10" />
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Periodo</span>
                <span className="text-sm font-black text-white capitalize">{format(new Date(), 'MMMM', { locale: es })}</span>
              </div>
            </div>

            <div className="text-right hidden md:block">
              <p className="text-sm font-bold text-white">{user.displayName}</p>
              <p className="text-xs text-slate-500">{user.email}</p>
            </div>
            <div className="h-8 w-[1px] bg-white/10 hidden md:block" />
            <button 
              onClick={() => setShowPrintPreview(true)}
              className="p-3 bg-white/5 hover:bg-blue-500/10 text-slate-400 hover:text-blue-400 rounded-2xl transition-all border border-white/5"
              title="Ver Informe para Imprimir"
            >
              <Printer className="w-5 h-5" />
            </button>
            <button 
              onClick={handleExportCSV}
              disabled={isExporting}
              className="p-3 bg-white/5 hover:bg-emerald-500/10 text-slate-400 hover:text-emerald-400 rounded-2xl transition-all border border-white/5 disabled:opacity-50"
              title="Exportar a Excel (CSV)"
            >
              <Download className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setCurrentView('dashboard')}
              className="p-3 bg-white/5 hover:bg-purple-500/10 text-slate-400 hover:text-purple-400 rounded-2xl transition-all border border-white/5 flex items-center gap-2"
              title="Ver Dashboard de Reportes"
            >
              <LayoutDashboard className="w-5 h-5" />
              <span className="hidden lg:inline text-xs font-black uppercase tracking-widest">Dashboard</span>
            </button>
            <div className="h-8 w-[1px] bg-white/10 hidden md:block" />
            <button 
              onClick={logOut}
              className="p-3 bg-white/5 hover:bg-red-500/10 text-slate-400 hover:text-red-400 rounded-2xl transition-all border border-white/5"
              title="Cerrar sesión"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="w-full px-4 py-10">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <motion.div 
            whileHover={{ y: -4 }}
            onDoubleClick={() => openMovementForm('outflow')}
            className="bg-[#1E293B] p-8 rounded-[2rem] shadow-xl border border-white/5 relative overflow-hidden group cursor-pointer select-none"
            title="Doble clic para registrar movimiento"
          >
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Wallet className="w-20 h-20" />
            </div>
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-emerald-500/10 rounded-2xl">
                <Wallet className="w-6 h-6 text-emerald-400" />
              </div>
              <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Caja Fuerte (Tienda)</span>
            </div>
            <p className="text-4xl font-black text-white font-mono">
              ${accumulatedSafeTotal.toLocaleString('es-CL')}
            </p>
          </motion.div>

          <motion.div 
            whileHover={{ y: -4 }}
            onDoubleClick={() => openMovementForm('outflow')}
            className="bg-[#1E293B] p-8 rounded-[2rem] shadow-xl border border-white/5 relative overflow-hidden group cursor-pointer select-none"
            title="Doble clic para registrar salida"
          >
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <TrendingUp className="w-20 h-20" />
            </div>
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-blue-500/10 rounded-2xl">
                <TrendingUp className="w-6 h-6 text-blue-400" />
              </div>
              <span className="text-xs font-black text-slate-500 uppercase tracking-widest">En Tránsito (Efectivo)</span>
            </div>
            <p className="text-4xl font-black text-white font-mono">
              ${accumulatedTransitTotal.toLocaleString('es-CL')}
            </p>
          </motion.div>

          <motion.div 
            whileHover={{ y: -4 }}
            onDoubleClick={() => openMovementForm('transfer')}
            className="bg-[#1E293B] p-8 rounded-[2rem] shadow-xl border border-white/5 relative overflow-hidden group cursor-pointer select-none"
            title="Doble clic para registrar transferencia a banco"
          >
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Building2 className="w-20 h-20" />
            </div>
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-purple-500/10 rounded-2xl">
                <Building2 className="w-6 h-6 text-purple-400" />
              </div>
              <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Banco</span>
            </div>
            <p className="text-4xl font-black text-white font-mono">
              ${accumulatedBankTotal.toLocaleString('es-CL')}
            </p>
          </motion.div>

          <motion.div 
            whileHover={{ y: -4 }}
            onDoubleClick={() => openMovementForm('outflow')}
            className="bg-[#1E293B] p-8 rounded-[2rem] shadow-xl border border-white/5 relative overflow-hidden group cursor-pointer select-none"
            title="Doble clic para registrar gasto"
          >
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <ArrowUpRight className="w-20 h-20" />
            </div>
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-rose-500/10 rounded-2xl">
                <ArrowUpRight className="w-6 h-6 text-rose-400" />
              </div>
              <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Salidas (Gastos)</span>
            </div>
            <p className="text-4xl font-black text-white font-mono">
              ${accumulatedOutflowTotal.toLocaleString('es-CL')}
            </p>
          </motion.div>
        </div>

        {/* Actions Bar */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 mb-8">
          <div className="flex-1">
            <h2 className="text-3xl font-black text-white mb-2 flex items-center gap-3">
              <History className="w-8 h-8 text-blue-500" />
              Historial de Turnos
            </h2>
            <p className="text-slate-500 text-sm">Registro detallado de todos los cierres contables realizados.</p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full lg:w-auto">
            <div className="relative group flex-1 sm:w-64">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
              <input 
                type="text"
                placeholder="Buscar por nombre o nota..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-11 pr-4 py-4 bg-[#1E293B] border border-white/5 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:bg-[#2D3748] outline-none transition-all text-white placeholder:text-slate-600 text-sm"
              />
            </div>
            
            <div className="flex items-center gap-2">
              {(localStorage.getItem('closures') || localStorage.getItem('movements')) && (
                <button
                  onClick={handleMigrateData}
                  disabled={isMigrating}
                  className="p-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black flex items-center justify-center gap-3 transition-all shadow-xl disabled:opacity-50"
                  title="Migrar datos locales a la nube"
                >
                  <RefreshCw className={`w-6 h-6 ${isMigrating ? 'animate-spin' : ''}`} />
                  {isMigrating ? 'Migrando...' : 'Migrar a Nube'}
                </button>
              )}
              <button
                onClick={toggleBulkEdit}
                className={`p-4 rounded-2xl font-black flex items-center justify-center gap-3 transition-all shadow-xl ${
                  isBulkEditing 
                    ? 'bg-amber-500 text-white shadow-amber-500/20' 
                    : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/5'
                }`}
                title={isBulkEditing ? 'Cancelar edición masiva' : 'Habilitar edición masiva'}
              >
                <Edit2 className="w-6 h-6" />
                {isBulkEditing && <span>Modo Edición</span>}
              </button>

              {isBulkEditing && (
                <button
                  onClick={handleSaveBulkEdit}
                  className="bg-emerald-600 text-white px-8 py-4 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-emerald-500 transition-all shadow-xl shadow-emerald-500/20"
                >
                  <Check className="w-6 h-6" />
                  Guardar Todo
                </button>
              )}

              <button
                onClick={() => {
                  setMovementValues({ ...movementValues, type: 'internal_transfer', from: 'transit', to: 'safe' });
                  setIsAddingMovement(true);
                }}
                className="bg-amber-600 text-white px-8 py-4 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-amber-500 transition-all shadow-xl shadow-amber-500/20 group whitespace-nowrap"
              >
                <ArrowRightLeft className={`w-6 h-6 transition-transform group-hover:scale-110`} />
                Entre Cajas
              </button>

              <button
                onClick={() => {
                  setMovementValues({ ...movementValues, type: 'outflow' });
                  setIsAddingMovement(!isAddingMovement);
                }}
                className="bg-purple-600 text-white px-8 py-4 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-purple-500 transition-all shadow-xl shadow-purple-500/20 group whitespace-nowrap"
              >
                <ArrowRightLeft className={`w-6 h-6 transition-transform ${isAddingMovement && movementValues.type === 'outflow' ? 'rotate-180' : 'group-hover:scale-110'}`} />
                {isAddingMovement && movementValues.type === 'outflow' ? 'Cancelar' : 'Movimiento'}
              </button>

              <button
                onClick={() => setIsInlineAdding(!isInlineAdding)}
                className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-blue-500 transition-all shadow-xl shadow-blue-500/20 group whitespace-nowrap"
              >
                <Plus className={`w-6 h-6 transition-transform ${isInlineAdding ? 'rotate-45' : 'group-hover:rotate-90'}`} />
                {isInlineAdding ? 'Cancelar' : 'Nuevo Registro'}
              </button>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {isAddingMovement && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsAddingMovement(false)}
                className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
              />
              <motion.div
                id="movement-form"
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-4xl bg-[#1E293B] p-8 rounded-[2.5rem] border border-purple-500/20 shadow-2xl shadow-purple-500/5 overflow-y-auto max-h-[90vh]"
              >
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-purple-500/10 rounded-2xl">
                      <ArrowRightLeft className="w-6 h-6 text-purple-400" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-white">Registrar Movimiento de Dinero</h3>
                      <p className="text-slate-500 text-sm">Registra salidas de efectivo o transferencias bancarias.</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsAddingMovement(false)}
                    className="p-2 hover:bg-white/5 rounded-xl text-slate-500 hover:text-white transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="space-y-8">
                  {/* Tipo de Movimiento - Fila Superior */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Tipo de Movimiento</label>
                    <div className="flex bg-white/5 p-1.5 rounded-[1.5rem] border border-white/5 max-w-2xl">
                      <button
                        onClick={() => setMovementValues({ ...movementValues, type: 'outflow', category: categories[0] })}
                        className={`flex-1 py-4 px-6 rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-3 ${
                          movementValues.type === 'outflow' 
                            ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20' 
                            : 'text-slate-400 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <ArrowUpRight className="w-5 h-5" />
                        Salida
                      </button>
                      <button
                        onClick={() => setMovementValues({ ...movementValues, type: 'transfer', category: undefined, from: 'transit', to: 'bank' })}
                        className={`flex-1 py-4 px-6 rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-3 ${
                          movementValues.type === 'transfer' 
                            ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/20' 
                            : 'text-slate-400 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <Building2 className="w-5 h-5" />
                        A Banco
                      </button>
                      <button
                        onClick={() => setMovementValues({ ...movementValues, type: 'internal_transfer', category: undefined, from: 'transit', to: 'safe' })}
                        className={`flex-1 py-4 px-6 rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-3 ${
                          movementValues.type === 'internal_transfer' 
                            ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' 
                            : 'text-slate-400 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <ArrowRightLeft className="w-5 h-5" />
                        Entre Cajas
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {(movementValues.type === 'internal_transfer' || movementValues.type === 'transfer') && (
                      <>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Origen</label>
                          <div className="relative">
                            <ArrowDownLeft className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500" />
                            <select
                              value={movementValues.from || 'transit'}
                              onChange={(e) => setMovementValues({ ...movementValues, from: e.target.value })}
                              className="w-full pl-11 pr-4 py-4 bg-white/5 border border-white/5 rounded-2xl focus:ring-2 focus:ring-amber-500 outline-none transition-all text-white appearance-none cursor-pointer"
                            >
                              <option value="transit" className="bg-[#1E293B]">En Tránsito</option>
                              <option value="safe" className="bg-[#1E293B]">Caja Fuerte</option>
                              <option value="bank" className="bg-[#1E293B]">Banco</option>
                            </select>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Destino</label>
                          <div className="relative">
                            <ArrowUpRight className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
                            <select
                              value={movementValues.to || 'safe'}
                              onChange={(e) => setMovementValues({ ...movementValues, to: e.target.value })}
                              className="w-full pl-11 pr-4 py-4 bg-white/5 border border-white/5 rounded-2xl focus:ring-2 focus:ring-amber-500 outline-none transition-all text-white appearance-none cursor-pointer"
                            >
                              <option value="safe" className="bg-[#1E293B]">Caja Fuerte</option>
                              <option value="transit" className="bg-[#1E293B]">En Tránsito</option>
                              <option value="bank" className="bg-[#1E293B]">Banco</option>
                            </select>
                          </div>
                        </div>
                      </>
                    )}

                    {movementValues.type === 'outflow' && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between ml-1">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Categoría</label>
                          <button 
                            onClick={() => setIsEditingCategories(true)}
                            className="text-[10px] font-black text-purple-400 uppercase tracking-widest hover:text-purple-300 transition-colors"
                          >
                            Editar
                          </button>
                        </div>
                        <div className="relative group">
                          <Tag className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                          <select
                            value={movementValues.category || ''}
                            onChange={(e) => {
                              if (e.target.value === 'NEW') {
                                setIsAddingNewCategory(true);
                              } else {
                                setMovementValues({ ...movementValues, category: e.target.value });
                              }
                            }}
                            className="w-full pl-11 pr-10 py-4 bg-white/5 border border-white/5 rounded-2xl focus:ring-2 focus:ring-purple-500 outline-none transition-all text-white appearance-none cursor-pointer"
                          >
                            {categories.map(cat => (
                              <option key={cat} value={cat} className="bg-[#1E293B]">{cat}</option>
                            ))}
                            <option value="NEW" className="bg-[#1E293B] text-purple-400 font-bold">+ Agregar nueva...</option>
                          </select>
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                            <Plus className="w-4 h-4 text-slate-500" />
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Monto</label>
                      <div className="relative">
                        <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                          type="number"
                          value={movementValues.amount || ''}
                          onChange={(e) => setMovementValues({ ...movementValues, amount: parseFloat(e.target.value) || 0 })}
                          className="w-full pl-11 pr-4 py-4 bg-white/5 border border-white/5 rounded-2xl focus:ring-2 focus:ring-purple-500 outline-none transition-all text-white font-mono"
                          placeholder="0"
                        />
                      </div>
                    </div>

                    <div className={`space-y-2 md:col-span-2 lg:col-span-3`}>
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Descripción / Motivo</label>
                      <div className="relative">
                        <FileText className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                          type="text"
                          value={movementValues.description || ''}
                          onChange={(e) => setMovementValues({ ...movementValues, description: e.target.value })}
                          className="w-full pl-11 pr-4 py-4 bg-white/5 border border-white/5 rounded-2xl focus:ring-2 focus:ring-purple-500 outline-none transition-all text-white"
                          placeholder="Ej: Pago proveedor, Depósito Banco Estado..."
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <AnimatePresence>
                  {isAddingNewCategory && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="mt-6 p-6 bg-white/5 rounded-3xl border border-white/10 flex flex-col sm:flex-row items-end gap-4"
                    >
                      <div className="flex-1 space-y-2 w-full">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nombre de la Nueva Categoría</label>
                        <input
                          type="text"
                          autoFocus
                          value={newCategoryName}
                          onChange={(e) => setNewCategoryName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                          className="w-full px-4 py-3 bg-white/5 border border-white/5 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none transition-all text-white"
                          placeholder="Ej: Mantenimiento, Publicidad..."
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setIsAddingNewCategory(false);
                            setNewCategoryName('');
                          }}
                          className="px-4 py-3 rounded-xl font-bold text-slate-400 hover:bg-white/5 transition-all text-sm"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={handleAddCategory}
                          className="bg-purple-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-purple-500 transition-all text-sm shadow-lg shadow-purple-500/20"
                        >
                          Añadir Categoría
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="mt-8 flex justify-end gap-4">
                  <button
                    onClick={() => setIsAddingMovement(false)}
                    className="px-8 py-4 rounded-2xl font-black text-slate-400 hover:bg-white/5 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSaveMovement}
                    disabled={!movementValues.amount || !movementValues.description}
                    className="bg-purple-600 text-white px-10 py-4 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-purple-500 transition-all shadow-xl shadow-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Check className="w-6 h-6" />
                    Registrar Movimiento
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Table Container */}
        <div className="bg-[#1E293B] rounded-[2.5rem] shadow-2xl border border-white/5 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white/5 border-b border-white/5">
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] border-r border-white/5">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3 h-3" />
                      Fecha y Hora
                    </div>
                  </th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] border-r border-white/5">
                    <div className="flex items-center gap-2">
                      <UserIcon className="w-3 h-3" />
                      Responsable
                    </div>
                  </th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] text-right border-r border-white/5">
                    <div className="flex items-center justify-end gap-2">
                      <DollarSign className="w-3 h-3" />
                      Físico
                    </div>
                  </th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] text-right border-r border-white/5">
                    <div className="flex items-center justify-end gap-2">
                      <Calculator className="w-3 h-3" />
                      Venta Sistema
                    </div>
                  </th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] text-right border-r border-white/5">
                    <div className="flex items-center justify-end gap-2">
                      <Wallet className="w-3 h-3" />
                      Cuadre Sistema
                    </div>
                  </th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] text-right border-r border-white/5">
                    <div className="flex items-center justify-end gap-2">
                      <AlertCircle className="w-3 h-3" />
                      Diferencia
                    </div>
                  </th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] text-center border-r border-white/5">
                    Estado
                  </th>
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] text-right">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {isInlineAdding && (
                  <tr className="bg-blue-500/10">
                    <td className="px-4 py-3 border-r border-white/5">
                      <input
                        type="datetime-local"
                        autoFocus
                        value={inlineAddValues.date ? format(parseISO(inlineAddValues.date), "yyyy-MM-dd'T'HH:mm") : ''}
                        onChange={(e) => setInlineAddValues({ ...inlineAddValues, date: new Date(e.target.value).toISOString() })}
                        onFocus={(e) => e.target.select()}
                        onKeyDown={(e) => handleKeyDown(e, handleSaveInlineAdd)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                      />
                    </td>
                    <td className="px-4 py-3 border-r border-white/5">
                      <input
                        type="text"
                        value={inlineAddValues.responsible || ''}
                        onChange={(e) => setInlineAddValues({ ...inlineAddValues, responsible: e.target.value })}
                        onFocus={(e) => e.target.select()}
                        onKeyDown={(e) => handleKeyDown(e, handleSaveInlineAdd)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans"
                        placeholder="Responsable"
                        list="responsible-list"
                      />
                    </td>
                    <td className="px-4 py-3 border-r border-white/5">
                      <input
                        type="number"
                        value={inlineAddValues.physicalAmount || ''}
                        onChange={(e) => setInlineAddValues({ ...inlineAddValues, physicalAmount: parseFloat(e.target.value) })}
                        onFocus={(e) => e.target.select()}
                        onKeyDown={(e) => handleKeyDown(e, handleSaveInlineAdd)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white text-right focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                        placeholder="Físico"
                      />
                    </td>
                    <td className="px-4 py-3 border-r border-white/5">
                      <input
                        type="number"
                        value={inlineAddValues.systemAmount || ''}
                        onChange={(e) => setInlineAddValues({ ...inlineAddValues, systemAmount: parseFloat(e.target.value) })}
                        onFocus={(e) => e.target.select()}
                        onKeyDown={(e) => handleKeyDown(e, handleSaveInlineAdd)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white text-right focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                        placeholder="Venta"
                      />
                    </td>
                    <td className="px-4 py-3 border-r border-white/5">
                      <input
                        type="number"
                        value={inlineAddValues.systemBalance || ''}
                        onChange={(e) => setInlineAddValues({ ...inlineAddValues, systemBalance: parseFloat(e.target.value) })}
                        onFocus={(e) => e.target.select()}
                        onKeyDown={(e) => handleKeyDown(e, handleSaveInlineAdd)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white text-right focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                        placeholder="Cuadre"
                      />
                    </td>
                    <td className="px-4 py-3 text-right border-r border-white/5">
                      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-black bg-white/5 text-slate-400 font-mono">
                        ${((inlineAddValues.physicalAmount || 0) - (inlineAddValues.systemAmount || 0)).toLocaleString('es-CL')}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center border-r border-white/5">
                      <button 
                        onClick={() => {
                          const nextStatus = getNextStatus(inlineAddValues.status as any);
                          playSound(nextStatus);
                          setInlineAddValues({ ...inlineAddValues, status: nextStatus });
                        }}
                        onKeyDown={(e) => handleKeyDown(e, handleSaveInlineAdd)}
                        className={`p-2 rounded-xl transition-all flex items-center gap-2 mx-auto ${
                          inlineAddValues.status === 'transit' 
                            ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30' 
                            : inlineAddValues.status === 'bank'
                              ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30'
                        }`}
                      >
                        {inlineAddValues.status === 'transit' ? (
                          <Truck className="w-4 h-4" />
                        ) : inlineAddValues.status === 'bank' ? (
                          <Building2 className="w-4 h-4" />
                        ) : (
                          <ShieldCheck className="w-4 h-4" />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={handleSaveInlineAdd}
                          className="p-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-all shadow-lg shadow-blue-500/20"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setIsInlineAdding(false)}
                          className="p-2 bg-white/5 hover:bg-white/10 text-slate-400 rounded-xl transition-all"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
                {groupedClosures.length === 0 && !isInlineAdding ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-20 text-center">
                      <div className="flex flex-col items-center gap-4 opacity-30">
                        <FileText className="w-12 h-12" />
                        <p className="text-lg font-bold">No se han encontrado registros</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  groupedClosures.map((group) => (
                    <React.Fragment key={group.date}>
                      {/* Day Summary Row */}
                      <tr 
                        onClick={() => toggleDay(group.date)}
                        className="bg-white/[0.03] border-y border-white/5 cursor-pointer hover:bg-white/[0.06] transition-colors"
                      >
                        <td className="px-4 py-4 border-r border-white/5">
                          <div className="flex items-center gap-3 font-sans">
                            <div className={`p-1 rounded-lg bg-white/5 transition-transform ${expandedDays[group.date] ? 'rotate-180' : ''}`}>
                              <TrendingDown className="w-4 h-4 text-slate-400" />
                            </div>
                            <div>
                              <p className="text-base font-black text-white">
                                {format(parseISO(group.date), 'EEEE, dd MMMM', { locale: es })}
                              </p>
                              <p className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">
                                {group.items.length} {group.items.length === 1 ? 'Registro' : 'Registros'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 border-r border-white/5">
                          <div className="flex items-center gap-2 font-sans">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Resumen del Día</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right text-sm font-black text-white font-mono border-r border-white/5">
                          ${group.totals.physicalAmount.toLocaleString('es-CL')}
                        </td>
                        <td className="px-4 py-4 text-right text-sm font-black text-slate-400 font-mono border-r border-white/5">
                          ${group.totals.systemAmount.toLocaleString('es-CL')}
                        </td>
                        <td className="px-4 py-4 text-right text-sm font-black text-slate-400 font-mono border-r border-white/5">
                          ${group.totals.systemBalance.toLocaleString('es-CL')}
                        </td>
                        <td className="px-4 py-4 text-right border-r border-white/5">
                          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-black font-mono ${
                            group.totals.difference === 0 ? 'bg-emerald-500/10 text-emerald-400' : 
                            group.totals.difference > 0 ? 'bg-blue-500/10 text-blue-400' : 'bg-rose-500/10 text-rose-400'
                          }`}>
                            {group.totals.difference > 0 ? '+' : ''}{group.totals.difference.toLocaleString('es-CL')}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center border-r border-white/5">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleDayStatus(group.date);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.stopPropagation();
                                toggleDayStatus(group.date);
                              }
                            }}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              if (!expandedDays[group.date]) {
                                toggleDay(group.date);
                              }
                              if (!isBulkEditing) {
                                toggleBulkEdit();
                              }
                            }}
                            className={`px-3 py-2 rounded-xl transition-all flex items-center gap-2 mx-auto border ${
                              dayStatuses[group.date] === 'transit' 
                                ? 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20' 
                                : dayStatuses[group.date] === 'bank'
                                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
                                  : 'bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20'
                            }`}
                            title="Click para cambiar estado | Doble click para editar día"
                          >
                            {dayStatuses[group.date] === 'transit' ? (
                              <Truck className="w-4 h-4" />
                            ) : dayStatuses[group.date] === 'bank' ? (
                              <Building2 className="w-4 h-4" />
                            ) : (
                              <ShieldCheck className="w-4 h-4" />
                            )}
                            <span className="text-[10px] font-black uppercase tracking-widest">
                              {dayStatuses[group.date] === 'transit' ? 'Tránsito' : dayStatuses[group.date] === 'bank' ? 'A Banco' : 'En Tienda'}
                            </span>
                          </button>
                        </td>
                        <td className="px-4 py-4"></td>
                      </tr>

                      {/* Individual Records */}
                      <AnimatePresence>
                        {(expandedDays[group.date] || isBulkEditing) && group.items.map((closure) => (
                          <motion.tr 
                            key={closure.id}
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className={`transition-colors group ${inlineEditingId === closure.id || isBulkEditing ? 'bg-blue-500/5' : 'hover:bg-white/[0.02]'}`}
                          >
                            {inlineEditingId === closure.id || isBulkEditing ? (
                              <>
                                <td className="px-4 py-3 border-r border-white/5">
                                  <input
                                    type="datetime-local"
                                    value={
                                      isBulkEditing 
                                        ? (bulkEditValues[closure.id!]?.date ? format(parseISO(bulkEditValues[closure.id!]?.date!), "yyyy-MM-dd'T'HH:mm") : format(parseISO(closure.date), "yyyy-MM-dd'T'HH:mm"))
                                        : (inlineEditValues.date ? format(parseISO(inlineEditValues.date), "yyyy-MM-dd'T'HH:mm") : format(parseISO(closure.date), "yyyy-MM-dd'T'HH:mm"))
                                    }
                                    onChange={(e) => {
                                      const newDate = new Date(e.target.value).toISOString();
                                      if (isBulkEditing) {
                                        setBulkEditValues({ ...bulkEditValues, [closure.id!]: { ...bulkEditValues[closure.id!], date: newDate } });
                                      } else {
                                        setInlineEditValues({ ...inlineEditValues, date: newDate });
                                      }
                                    }}
                                    onFocus={(e) => e.target.select()}
                                    onKeyDown={(e) => handleKeyDown(e, isBulkEditing ? handleSaveBulkEdit : handleSaveInlineEdit)}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                                  />
                                </td>
                                <td className="px-4 py-3 border-r border-white/5">
                                  <input
                                    type="text"
                                    value={
                                      isBulkEditing 
                                        ? (bulkEditValues[closure.id!]?.responsible ?? closure.responsible)
                                        : (inlineEditValues.responsible ?? closure.responsible)
                                    }
                                    onChange={(e) => {
                                      if (isBulkEditing) {
                                        setBulkEditValues({ ...bulkEditValues, [closure.id!]: { ...bulkEditValues[closure.id!], responsible: e.target.value } });
                                      } else {
                                        setInlineEditValues({ ...inlineEditValues, responsible: e.target.value });
                                      }
                                    }}
                                    onFocus={(e) => e.target.select()}
                                    onKeyDown={(e) => handleKeyDown(e, isBulkEditing ? handleSaveBulkEdit : handleSaveInlineEdit)}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans"
                                    list="responsible-list"
                                  />
                                </td>
                                <td className="px-4 py-3 border-r border-white/5">
                                  <input
                                    type="number"
                                    value={
                                      isBulkEditing 
                                        ? (bulkEditValues[closure.id!]?.physicalAmount ?? closure.physicalAmount)
                                        : (inlineEditValues.physicalAmount ?? closure.physicalAmount)
                                    }
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value);
                                      if (isBulkEditing) {
                                        setBulkEditValues({ ...bulkEditValues, [closure.id!]: { ...bulkEditValues[closure.id!], physicalAmount: val } });
                                      } else {
                                        setInlineEditValues({ ...inlineEditValues, physicalAmount: val });
                                      }
                                    }}
                                    onFocus={(e) => e.target.select()}
                                    onKeyDown={(e) => handleKeyDown(e, isBulkEditing ? handleSaveBulkEdit : handleSaveInlineEdit)}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white text-right focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                                  />
                                </td>
                                <td className="px-4 py-3 border-r border-white/5">
                                  <input
                                    type="number"
                                    value={
                                      isBulkEditing 
                                        ? (bulkEditValues[closure.id!]?.systemAmount ?? closure.systemAmount)
                                        : (inlineEditValues.systemAmount ?? closure.systemAmount)
                                    }
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value);
                                      if (isBulkEditing) {
                                        setBulkEditValues({ ...bulkEditValues, [closure.id!]: { ...bulkEditValues[closure.id!], systemAmount: val } });
                                      } else {
                                        setInlineEditValues({ ...inlineEditValues, systemAmount: val });
                                      }
                                    }}
                                    onFocus={(e) => e.target.select()}
                                    onKeyDown={(e) => handleKeyDown(e, isBulkEditing ? handleSaveBulkEdit : handleSaveInlineEdit)}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white text-right focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                                  />
                                </td>
                                <td className="px-4 py-3 border-r border-white/5">
                                  <input
                                    type="number"
                                    value={
                                      isBulkEditing 
                                        ? (bulkEditValues[closure.id!]?.systemBalance ?? closure.systemBalance)
                                        : (inlineEditValues.systemBalance ?? closure.systemBalance)
                                    }
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value);
                                      if (isBulkEditing) {
                                        setBulkEditValues({ ...bulkEditValues, [closure.id!]: { ...bulkEditValues[closure.id!], systemBalance: val } });
                                      } else {
                                        setInlineEditValues({ ...inlineEditValues, systemBalance: val });
                                      }
                                    }}
                                    onFocus={(e) => e.target.select()}
                                    onKeyDown={(e) => handleKeyDown(e, isBulkEditing ? handleSaveBulkEdit : handleSaveInlineEdit)}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white text-right focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                                  />
                                </td>
                                <td className="px-4 py-3 text-right border-r border-white/5">
                                  <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-black font-mono ${
                                    closure.difference === 0 ? 'bg-emerald-500/10 text-emerald-400' : 
                                    closure.difference > 0 ? 'bg-blue-500/10 text-blue-400' : 'bg-rose-500/10 text-rose-400'
                                  }`}>
                                    {closure.difference > 0 ? '+' : ''}{closure.difference.toLocaleString('es-CL')}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-center border-r border-white/5">
                                  <button 
                                    onClick={() => {
                                      const currentStatus = isBulkEditing ? (bulkEditValues[closure.id!]?.status || closure.status) : (inlineEditValues.status || closure.status);
                                      const nextStatus = getNextStatus(currentStatus as any);
                                      playSound(nextStatus);
                                      if (isBulkEditing) {
                                        setBulkEditValues({ ...bulkEditValues, [closure.id!]: { ...bulkEditValues[closure.id!], status: nextStatus } });
                                      } else {
                                        setInlineEditValues({ ...inlineEditValues, status: nextStatus });
                                      }
                                    }}
                                    onKeyDown={(e) => handleKeyDown(e, isBulkEditing ? handleSaveBulkEdit : handleSaveInlineEdit)}
                                    className={`p-2 rounded-xl transition-all flex items-center gap-2 mx-auto ${
                                      (isBulkEditing ? (bulkEditValues[closure.id!]?.status || closure.status) : (inlineEditValues.status || closure.status)) === 'transit' 
                                        ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30' 
                                        : (isBulkEditing ? (bulkEditValues[closure.id!]?.status || closure.status) : (inlineEditValues.status || closure.status)) === 'bank'
                                          ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                                          : 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30'
                                    }`}
                                  >
                                    {(isBulkEditing ? (bulkEditValues[closure.id!]?.status || closure.status) : (inlineEditValues.status || closure.status)) === 'transit' ? (
                                      <Truck className="w-4 h-4" />
                                    ) : (isBulkEditing ? (bulkEditValues[closure.id!]?.status || closure.status) : (inlineEditValues.status || closure.status)) === 'bank' ? (
                                      <Building2 className="w-4 h-4" />
                                    ) : (
                                      <ShieldCheck className="w-4 h-4" />
                                    )}
                                  </button>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {!isBulkEditing && (
                                    <div className="flex items-center justify-end gap-2">
                                      <button
                                        onClick={handleSaveInlineEdit}
                                        className="p-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-all shadow-lg shadow-blue-500/20"
                                      >
                                        <Check className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={handleCancelInlineEdit}
                                        className="p-2 bg-white/5 hover:bg-white/10 text-slate-400 rounded-xl transition-all"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="px-4 py-6 border-r border-white/5">
                                  <p className="text-sm font-black text-white">{format(parseISO(closure.date), 'dd MMM', { locale: es })}</p>
                                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider font-mono">
                                    {format(parseISO(closure.date), 'HH:mm')} hrs
                                  </p>
                                </td>
                                <td className="px-4 py-6 border-r border-white/5">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-white/5 rounded-xl flex items-center justify-center border border-white/5">
                                      <UserIcon className="w-4 h-4 text-slate-400" />
                                    </div>
                                    <div>
                                      <span className="text-sm font-bold text-slate-200">{closure.responsible}</span>
                                      {closure.notes && (
                                        <div className="flex items-center gap-1 text-[10px] text-blue-400 mt-1">
                                          <MessageSquare className="w-3 h-3" />
                                          <span>Tiene notas</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-6 text-right border-r border-white/5">
                                  <p className="text-sm font-black text-white font-mono">${closure.physicalAmount.toLocaleString('es-CL')}</p>
                                </td>
                                <td className="px-4 py-6 text-right border-r border-white/5">
                                  <p className="text-sm font-black text-slate-400 font-mono">${closure.systemAmount.toLocaleString('es-CL')}</p>
                                </td>
                                <td className="px-4 py-6 text-right border-r border-white/5">
                                  <p className="text-sm font-black text-slate-400 font-mono">${closure.systemBalance?.toLocaleString('es-CL') || '0'}</p>
                                </td>
                                <td className="px-4 py-6 text-right border-r border-white/5">
                                  <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-black font-mono ${
                                    closure.difference === 0 ? 'bg-emerald-500/10 text-emerald-400' : 
                                    closure.difference > 0 ? 'bg-blue-500/10 text-blue-400' : 'bg-rose-500/10 text-rose-400'
                                  }`}>
                                    {closure.difference === 0 ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                                    {closure.difference > 0 ? '+' : ''}{closure.difference.toLocaleString('es-CL')}
                                  </div>
                                </td>
                                <td className="px-4 py-6 text-center border-r border-white/5">
                                  <button 
                                    onClick={() => closure.id && toggleStatus(closure.id)}
                                    onDoubleClick={() => handleEdit(closure)}
                                    className={`p-2 rounded-xl transition-all flex items-center gap-2 mx-auto ${
                                      closure.status === 'transit' 
                                        ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20' 
                                        : closure.status === 'bank'
                                          ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                                          : 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20'
                                    }`}
                                  >
                                    {closure.status === 'transit' ? (
                                      <Truck className="w-4 h-4" />
                                    ) : closure.status === 'bank' ? (
                                      <Building2 className="w-4 h-4" />
                                    ) : (
                                      <ShieldCheck className="w-4 h-4" />
                                    )}
                                  </button>
                                </td>
                                <td className="px-4 py-6">
                                  <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button 
                                      onClick={() => copyToClipboard(closure)}
                                      className="p-2 text-slate-600 hover:text-blue-400 hover:bg-blue-500/10 rounded-xl transition-all"
                                      title="Copiar detalles"
                                    >
                                      <Copy className="w-4 h-4" />
                                    </button>
                                    <button 
                                      onClick={() => handleDuplicate(closure)}
                                      className="p-2 text-slate-600 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-xl transition-all"
                                      title="Duplicar registro"
                                    >
                                      <CopyPlus className="w-4 h-4" />
                                    </button>
                                    <button 
                                      onClick={() => handleEdit(closure)}
                                      className="p-2 text-slate-600 hover:text-blue-400 hover:bg-blue-500/10 rounded-xl transition-all"
                                      title="Editar registro"
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button 
                                      onClick={() => closure.id && setDeleteConfirmId(closure.id)}
                                      className="p-2 text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all"
                                      title="Eliminar registro"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </>
                            )}
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Movements History Section */}
        <div className="mt-12">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-3xl font-black text-white mb-2 flex items-center gap-3">
                <ArrowRightLeft className="w-8 h-8 text-purple-500" />
                Historial de Movimientos
              </h2>
              <p className="text-slate-500 text-sm">Registro de salidas de efectivo y transferencias a bancos.</p>
            </div>
          </div>

          <div className="bg-[#1E293B] rounded-[2.5rem] shadow-2xl border border-white/5 overflow-hidden">
            {movements.length === 0 ? (
              <div className="p-20 text-center">
                <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6 border border-white/5">
                  <ArrowRightLeft className="w-10 h-10 text-slate-700" />
                </div>
                <h3 className="text-xl font-black text-slate-400">Sin movimientos registrados</h3>
                <p className="text-slate-600 mt-2">Usa el botón "Movimiento" para registrar salidas o transferencias.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white/5 border-b border-white/5">
                      <th className="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Fecha</th>
                      <th className="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Tipo / Categoría</th>
                      <th className="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Descripción</th>
                      <th className="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] text-right">Monto</th>
                      <th className="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((movement) => (
                      <tr key={movement.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors group">
                        <td className="px-8 py-6">
                          <p className="text-sm font-black text-white">{format(parseISO(movement.date), 'dd MMM, yyyy', { locale: es })}</p>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider font-mono">
                            {format(parseISO(movement.date), 'HH:mm')} hrs
                          </p>
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex flex-col gap-2">
                            <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 w-fit ${
                              movement.type === 'outflow' 
                                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' 
                                : movement.type === 'transfer'
                                  ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}>
                              {movement.type === 'outflow' ? <ArrowUpRight className="w-3 h-3" /> : movement.type === 'transfer' ? <Building2 className="w-3 h-3" /> : <ArrowRightLeft className="w-3 h-3" />}
                              {movement.type === 'outflow' ? 'Salida' : movement.type === 'transfer' ? 'A Banco' : 'Entre Cajas'}
                            </span>
                            {movement.category && (
                              <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1 ml-1">
                                <Tag className="w-3 h-3" />
                                {movement.category}
                              </span>
                            )}
                            {(movement.type === 'internal_transfer' || movement.type === 'transfer') && (
                              <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1 ml-1">
                                <ArrowRight className="w-3 h-3" />
                                {movement.from === 'transit' ? 'Tránsito' : movement.from === 'safe' ? 'Caja Fuerte' : 'Banco'} → {movement.to === 'transit' ? 'Tránsito' : movement.to === 'safe' ? 'Caja Fuerte' : 'Banco'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <p className="text-sm font-medium text-slate-300">{movement.description}</p>
                        </td>
                        <td className="px-8 py-6 text-right">
                          <p className={`text-lg font-black font-mono ${
                            movement.type === 'outflow' ? 'text-rose-400' : 
                            movement.type === 'transfer' ? 'text-purple-400' : 'text-amber-400'
                          }`}>
                            ${movement.amount.toLocaleString('es-CL')}
                          </p>
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex items-center justify-center">
                            <button
                              onClick={() => handleDeleteMovement(movement.id)}
                              className="p-3 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 rounded-2xl transition-all opacity-0 group-hover:opacity-100"
                              title="Eliminar movimiento"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>

    {/* Printable Report Section */}
    <div className={`fixed inset-0 bg-slate-800/95 text-black p-4 md:p-8 z-[9999] overflow-auto font-sans ${showPrintPreview ? 'block' : 'hidden'} print:block print:bg-white print:p-0`}>
        <div className="max-w-[210mm] mx-auto">
          {/* Preview Controls */}
          <div className="flex justify-end gap-3 mb-8 print:hidden sticky top-0 z-50 bg-slate-800/50 backdrop-blur-md p-4 rounded-2xl border border-white/10">
            {printError && (
              <div className="mr-auto text-red-400 text-sm font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {printError}
              </div>
            )}
            <button 
              type="button"
              onClick={handleDownload}
              className="px-6 py-3 bg-white/10 text-white border border-white/20 rounded-2xl font-black shadow-xl hover:bg-white/20 transition-all flex items-center gap-2 active:scale-95"
            >
              <Download className="w-5 h-5" />
              Descargar PDF
            </button>
            <button 
              type="button"
              onClick={handlePrint}
              className="px-6 py-3 bg-blue-600 text-white rounded-2xl font-black shadow-xl shadow-blue-500/20 hover:bg-blue-700 transition-all flex items-center gap-2 active:scale-95"
            >
              <Printer className="w-5 h-5" />
              Imprimir
            </button>
            <button 
              type="button"
              onClick={() => {
                console.log('Cerrando vista previa');
                setShowPrintPreview(false);
              }}
              className="px-6 py-3 bg-red-500/10 text-red-400 border border-red-500/20 rounded-2xl font-black shadow-xl hover:bg-red-500/20 transition-all flex items-center gap-2 active:scale-95"
            >
              <X className="w-5 h-5" />
              Cerrar
            </button>
          </div>

          <div ref={reportRef} className="bg-white shadow-2xl min-h-[297mm] p-[5mm] md:p-[8mm] print:shadow-none print:p-0 print:m-0">

          <div className="flex justify-between items-start border-b-2 border-black pb-2 mb-2 mt-2 print:mt-0">
            <div>
              <h1 className="text-xl font-black uppercase tracking-tighter">CIERRES 1.0</h1>
              <p className="text-[10px] text-gray-600 font-bold">Accounting Suite - Reporte Detallado</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold">Fecha de Impresión</p>
              <p className="text-sm font-black">{format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
            </div>
          </div>

          {groupedClosures.length === 0 ? (
            <div className="py-20 text-center border-2 border-dashed border-gray-200 rounded-3xl">
              <p className="text-gray-400 font-bold">No hay cierres registrados para el periodo seleccionado.</p>
            </div>
          ) : groupedClosures.map((group) => {
            // Group group.items by responsible
            const byResponsible: Record<string, ShiftClosure[]> = {};
            group.items.forEach(item => {
              if (!byResponsible[item.responsible]) {
                byResponsible[item.responsible] = [];
              }
              byResponsible[item.responsible].push(item);
            });

            return (
              <div key={group.date} className="mb-4 break-inside-avoid">
                <div className="bg-gray-100 p-1 mb-1 border-l-4 border-black">
                  <h2 className="text-base font-black uppercase">
                    {format(parseISO(group.date), 'EEEE, dd MMMM yyyy', { locale: es })}
                  </h2>
                </div>

                {Object.entries(byResponsible).map(([responsible, items]) => (
                  <div key={responsible} className="ml-1 mb-2">
                    <h3 className="text-sm font-bold border-b border-gray-300 mb-0.5 pb-0.5 flex justify-between items-center">
                      <span>Cajero: {responsible}</span>
                      <span className="text-[10px] font-normal text-gray-500">{items.length} cierres</span>
                    </h3>
                    <table className="w-full text-[10px] mb-1 border-collapse">
                      <thead>
                        <tr className="border-b border-gray-200 text-left">
                          <th className="py-0.5 px-1">Hora</th>
                          <th className="py-0.5 px-1 text-right">Sistema</th>
                          <th className="py-0.5 px-1 text-right">Cuadre</th>
                          <th className="py-0.5 px-1 text-right">Físico</th>
                          <th className="py-0.5 px-1 text-right">Diff</th>
                          <th className="py-0.5 px-1 text-center">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, idx) => (
                          <tr key={idx} className="border-b border-gray-50">
                            <td className="py-0.5 px-1 font-mono">{format(parseISO(item.date), 'HH:mm')}</td>
                            <td className="py-0.5 px-1 text-right font-mono">${item.systemAmount.toLocaleString('es-CL')}</td>
                            <td className="py-0.5 px-1 text-right font-mono">${item.systemBalance?.toLocaleString('es-CL') || '0'}</td>
                            <td className="py-0.5 px-1 text-right font-mono font-bold">${item.physicalAmount.toLocaleString('es-CL')}</td>
                            <td className={`py-0.5 px-1 text-right font-mono font-bold ${item.difference < 0 ? 'text-red-600' : item.difference > 0 ? 'text-blue-600' : 'text-green-600'}`}>
                              {item.difference > 0 ? '+' : ''}{item.difference.toLocaleString('es-CL')}
                            </td>
                            <td className="py-0.5 px-1 text-center uppercase text-[8px] font-black">
                              {item.status === 'transit' ? 'Tránsito' : item.status === 'bank' ? 'Banco' : 'Tienda'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-50 font-bold">
                          <td className="py-0.5 px-1">TOTAL CAJERO</td>
                          <td className="py-0.5 px-1 text-right font-mono">${items.reduce((a, b) => a + b.systemAmount, 0).toLocaleString('es-CL')}</td>
                          <td className="py-0.5 px-1 text-right font-mono">${items.reduce((a, b) => a + (b.systemBalance || 0), 0).toLocaleString('es-CL')}</td>
                          <td className="py-0.5 px-1 text-right font-mono">${items.reduce((a, b) => a + b.physicalAmount, 0).toLocaleString('es-CL')}</td>
                          <td className={`py-0.5 px-1 text-right font-mono ${items.reduce((a, b) => a + b.difference, 0) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {items.reduce((a, b) => a + b.difference, 0).toLocaleString('es-CL')}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ))}

                <div className="mt-1 p-1 border border-black bg-gray-50 flex justify-between items-center">
                  <span className="text-sm font-black uppercase">Resumen Día {format(parseISO(group.date), 'dd/MM')}</span>
                  <div className="flex gap-4">
                    <div className="text-right">
                      <p className="text-[8px] text-gray-500 uppercase font-black">Total Físico</p>
                      <p className="text-base font-black font-mono">${group.totals.physicalAmount.toLocaleString('es-CL')}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[8px] text-gray-500 uppercase font-black">Diferencia Total</p>
                      <p className={`text-base font-black font-mono ${group.totals.difference < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {group.totals.difference > 0 ? '+' : ''}{group.totals.difference.toLocaleString('es-CL')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          <div className="mt-4 pt-2 border-t border-black text-center text-[8px] text-gray-400 italic">
            Este documento es un reporte generado por Accounting Suite. Reservados todos los derechos.
          </div>
        </div>
      </div>
    </div>

      {/* Edit Categories Modal */}
      <AnimatePresence>
        {isEditingCategories && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-white/10 rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-500/10 rounded-xl">
                    <Tag className="w-5 h-5 text-purple-400" />
                  </div>
                  <h3 className="text-xl font-black text-white">Editar Categorías</h3>
                </div>
                <button 
                  onClick={() => setIsEditingCategories(false)}
                  className="p-2 hover:bg-white/5 rounded-xl text-slate-500 hover:text-white transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
                {categories.map((cat, idx) => (
                  <div key={idx} className="flex items-center gap-3 group">
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        value={cat}
                        onChange={(e) => {
                          const newCats = [...categories];
                          newCats[idx] = e.target.value;
                          setCategories(newCats);
                        }}
                        className="w-full px-4 py-3 bg-white/5 border border-white/5 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none transition-all text-white text-sm"
                      />
                    </div>
                    <button
                      onClick={() => {
                        const newCats = categories.filter((_, i) => i !== idx);
                        handleUpdateCategories(newCats);
                      }}
                      className="p-3 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 rounded-xl transition-all"
                      title="Eliminar categoría"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex gap-3">
                <button
                  onClick={() => setIsEditingCategories(false)}
                  className="flex-1 px-6 py-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl font-black transition-all"
                >
                  Cerrar
                </button>
                <button
                  onClick={() => {
                    handleUpdateCategories(categories);
                    setIsEditingCategories(false);
                  }}
                  className="flex-1 px-6 py-4 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl font-black transition-all shadow-lg shadow-purple-500/20"
                >
                  Guardar Cambios
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmId && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-white/10 rounded-3xl p-6 max-w-sm w-full shadow-2xl"
            >
              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-16 h-16 bg-rose-500/20 rounded-full flex items-center justify-center">
                  <Trash2 className="w-8 h-8 text-rose-500" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-white">¿Eliminar registro?</h3>
                  <p className="text-slate-400 text-sm mt-2">
                    Esta acción no se puede deshacer. El registro se borrará permanentemente.
                  </p>
                </div>
                <div className="flex gap-3 w-full mt-2">
                  <button
                    onClick={() => setDeleteConfirmId(null)}
                    className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 text-white rounded-2xl font-bold transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
                    className="flex-1 px-4 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl font-bold transition-all shadow-lg shadow-rose-500/20"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <datalist id="responsible-list">
        {uniqueResponsibles.map(name => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
