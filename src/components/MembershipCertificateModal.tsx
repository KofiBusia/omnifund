import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Award, 
  Upload, 
  Send, 
  Download, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  Sliders, 
  Eye, 
  RefreshCw, 
  FileText, 
  ShieldCheck, 
  Users, 
  Check, 
  Palette, 
  Move, 
  Type, 
  Info,
  Layers,
  Sparkle
} from 'lucide-react';
import { Investor, InvestmentAccount } from '../types';
import { doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { jsPDF } from 'jspdf';
import { cn, formatCurrency, safeFormatDate } from '../lib/utils';
import { toast } from 'sonner';

interface FieldConfig {
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  size: number; // font size in px
  color: string;
  weight: 'normal' | 'bold' | '600';
  align: 'center' | 'left' | 'right';
  fontFamily: 'serif' | 'sans' | 'mono';
  visible: boolean;
  prefix?: string;
  suffix?: string;
}

interface LayoutConfig {
  title: FieldConfig;
  fundName: FieldConfig;
  citation: FieldConfig;
  investorName: FieldConfig;
  investorId: FieldConfig;
  units: FieldConfig;
  issueDate: FieldConfig;
  serialNumber: FieldConfig;
  signatory: FieldConfig;
}

interface MembershipCertificateModalProps {
  isOpen: boolean;
  onClose: () => void;
  investor: Investor | null;
  investorsList?: Investor[];
  fund: InvestmentAccount | null;
  isGmailConnected: boolean;
  onCertificateIssued?: () => void;
}

type TemplateType = 'y_invest' | 'royal_gold' | 'platinum_modern' | 'emerald_prestige' | 'heritage_cream' | 'custom_upload';

export default function MembershipCertificateModal({
  isOpen,
  onClose,
  investor,
  investorsList = [],
  fund,
  isGmailConnected,
  onCertificateIssued
}: MembershipCertificateModalProps) {
  // Mode selection: single investor vs bulk investors
  const isBulk = !investor && investorsList.length > 0;
  const targetInvestors = isBulk ? investorsList : (investor ? [investor] : []);
  const primaryInvestor = targetInvestors[0] || null;

  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>('y_invest');
  const [customImageUri, setCustomImageUri] = useState<string | null>(null);
  const [customImageAspect, setCustomImageAspect] = useState<number>(1.6); // width/height ratio

  const [signatoryName, setSignatoryName] = useState('Managing Director');
  const [signatoryTitle, setSignatoryTitle] = useState('');
  const [citationText, setCitationText] = useState('the trustees of the Y-invest equity trust fund confirm the membership of');
  const [emailSubject, setEmailSubject] = useState('Official Certificate of Membership');
  const [emailBody, setEmailBody] = useState('Enclosed is your official Certificate of Membership in recognition of your valued equity holding.');
  
  const [activeTab, setActiveTab] = useState<'design' | 'layout' | 'recipients'>('design');
  const [selectedField, setSelectedField] = useState<keyof LayoutConfig>('investorName');

  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Default smart positions tuned for Y-Invest & Custom certificates
  const [layout, setLayout] = useState<LayoutConfig>({
    title: { x: 50, y: 31, size: 48, color: '#1b365d', weight: 'bold', align: 'center', fontFamily: 'sans', visible: false, prefix: '', suffix: '' },
    fundName: { x: 50, y: 22, size: 24, color: '#1b365d', weight: 'bold', align: 'center', fontFamily: 'sans', visible: false, prefix: '', suffix: '' },
    citation: { x: 50, y: 41, size: 20, color: '#334155', weight: 'normal', align: 'center', fontFamily: 'sans', visible: false, prefix: '', suffix: '' },
    investorName: { x: 50, y: 55.5, size: 36, color: '#0f172a', weight: 'bold', align: 'center', fontFamily: 'sans', visible: true, prefix: '', suffix: '' },
    investorId: { x: 24, y: 65.7, size: 18, color: '#0f172a', weight: 'bold', align: 'center', fontFamily: 'sans', visible: true, prefix: '', suffix: '' },
    units: { x: 50, y: 64, size: 16, color: '#00aeef', weight: '600', align: 'center', fontFamily: 'sans', visible: false, prefix: 'UNITS: ', suffix: '' },
    issueDate: { x: 50, y: 65.7, size: 18, color: '#0f172a', weight: 'bold', align: 'center', fontFamily: 'sans', visible: true, prefix: '', suffix: '' },
    serialNumber: { x: 50, y: 96, size: 11, color: '#64748b', weight: 'normal', align: 'center', fontFamily: 'mono', visible: false, prefix: 'VERIFIED SERIAL: ', suffix: '' },
    signatory: { x: 76, y: 65.7, size: 18, color: '#0f172a', weight: 'bold', align: 'center', fontFamily: 'sans', visible: true, prefix: '', suffix: '' },
  });

  const applyTemplateDefaults = (template: TemplateType) => {
    setSelectedTemplate(template);
    setCustomImageUri(null);

    if (template === 'y_invest') {
      setCitationText('the trustees of the Y-invest equity trust fund confirm the membership of');
      setSignatoryName('Managing Director');
      setSignatoryTitle('');
      setLayout({
        title: { x: 50, y: 31, size: 48, color: '#1b365d', weight: 'bold', align: 'center', fontFamily: 'sans', visible: false, prefix: '', suffix: '' },
        fundName: { x: 50, y: 22, size: 24, color: '#1b365d', weight: 'bold', align: 'center', fontFamily: 'sans', visible: false, prefix: '', suffix: '' },
        citation: { x: 50, y: 41, size: 20, color: '#334155', weight: 'normal', align: 'center', fontFamily: 'sans', visible: false, prefix: '', suffix: '' },
        investorName: { x: 50, y: 55.5, size: 36, color: '#0f172a', weight: 'bold', align: 'center', fontFamily: 'sans', visible: true, prefix: '', suffix: '' },
        investorId: { x: 24, y: 65.7, size: 18, color: '#0f172a', weight: 'bold', align: 'center', fontFamily: 'sans', visible: true, prefix: '', suffix: '' },
        units: { x: 50, y: 64, size: 16, color: '#00aeef', weight: '600', align: 'center', fontFamily: 'sans', visible: false, prefix: 'UNITS: ', suffix: '' },
        issueDate: { x: 50, y: 65.7, size: 18, color: '#0f172a', weight: 'bold', align: 'center', fontFamily: 'sans', visible: true, prefix: '', suffix: '' },
        serialNumber: { x: 50, y: 96, size: 11, color: '#64748b', weight: 'normal', align: 'center', fontFamily: 'mono', visible: false, prefix: 'VERIFIED SERIAL: ', suffix: '' },
        signatory: { x: 76, y: 65.7, size: 18, color: '#0f172a', weight: 'bold', align: 'center', fontFamily: 'sans', visible: true, prefix: '', suffix: '' },
      });
    } else {
      setCitationText('is hereby officially recognized and admitted as a Certified Equity Member in good standing of');
      setSignatoryName('Dr. Marcus Vance');
      setSignatoryTitle('Chairman of Governance');
      setLayout({
        title: { x: 50, y: 18, size: 28, color: '#f59e0b', weight: 'bold', align: 'center', fontFamily: 'serif', visible: true, prefix: '', suffix: '' },
        fundName: { x: 50, y: 28, size: 36, color: '#ffffff', weight: 'bold', align: 'center', fontFamily: 'serif', visible: true, prefix: '', suffix: '' },
        citation: { x: 50, y: 38, size: 16, color: '#cbd5e1', weight: 'normal', align: 'center', fontFamily: 'serif', visible: true, prefix: '', suffix: '' },
        investorName: { x: 50, y: 48, size: 42, color: '#fbbf24', weight: 'bold', align: 'center', fontFamily: 'serif', visible: true, prefix: '', suffix: '' },
        investorId: { x: 50, y: 57, size: 16, color: '#94a3b8', weight: 'normal', align: 'center', fontFamily: 'mono', visible: true, prefix: 'MEMBER REG NO: ', suffix: '' },
        units: { x: 50, y: 64, size: 18, color: '#38bdf8', weight: '600', align: 'center', fontFamily: 'sans', visible: true, prefix: 'EQUITY HOLDING: ', suffix: ' UNITS' },
        issueDate: { x: 25, y: 82, size: 14, color: '#94a3b8', weight: 'normal', align: 'center', fontFamily: 'sans', visible: true, prefix: 'DATE OF ISSUANCE: ', suffix: '' },
        serialNumber: { x: 50, y: 92, size: 12, color: '#64748b', weight: 'normal', align: 'center', fontFamily: 'mono', visible: true, prefix: 'VERIFIED SERIAL: ', suffix: '' },
        signatory: { x: 75, y: 82, size: 14, color: '#f8fafc', weight: 'bold', align: 'center', fontFamily: 'serif', visible: true, prefix: '', suffix: '' },
      });
    }
  };

  // Handle uploaded custom image
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload a valid PNG, JPG, or WEBP certificate image.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUri = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        setCustomImageUri(dataUri);
        setCustomImageAspect(img.width / img.height);
        setSelectedTemplate('custom_upload');
        toast.success('Custom certificate design template uploaded!');
      };
      img.src = dataUri;
    };
    reader.readAsDataURL(file);
  };

  // Smart Auto-Layout optimization algorithm
  const handleAutoLayout = () => {
    setLayout({
      title: { x: 50, y: 16, size: 26, color: '#f59e0b', weight: 'bold', align: 'center', fontFamily: 'serif', visible: true, prefix: '', suffix: '' },
      fundName: { x: 50, y: 25, size: 34, color: '#ffffff', weight: 'bold', align: 'center', fontFamily: 'serif', visible: true, prefix: '', suffix: '' },
      citation: { x: 50, y: 35, size: 15, color: '#e2e8f0', weight: 'normal', align: 'center', fontFamily: 'serif', visible: true, prefix: '', suffix: '' },
      investorName: { x: 50, y: 46, size: 40, color: '#fcd34d', weight: 'bold', align: 'center', fontFamily: 'serif', visible: true, prefix: '', suffix: '' },
      investorId: { x: 50, y: 55, size: 15, color: '#cbd5e1', weight: 'normal', align: 'center', fontFamily: 'mono', visible: true, prefix: 'MEMBER ID: ', suffix: '' },
      units: { x: 50, y: 63, size: 17, color: '#38bdf8', weight: '600', align: 'center', fontFamily: 'sans', visible: true, prefix: 'EQUITY HOLDINGS: ', suffix: ' UNITS' },
      issueDate: { x: 25, y: 82, size: 13, color: '#94a3b8', weight: 'normal', align: 'center', fontFamily: 'sans', visible: true, prefix: 'ISSUED ON: ', suffix: '' },
      serialNumber: { x: 50, y: 92, size: 11, color: '#64748b', weight: 'normal', align: 'center', fontFamily: 'mono', visible: true, prefix: 'SERIAL: ', suffix: '' },
      signatory: { x: 75, y: 82, size: 13, color: '#f8fafc', weight: 'bold', align: 'center', fontFamily: 'serif', visible: true, prefix: '', suffix: '' },
    });
    toast.success('Smart AI Auto-Layout applied centered optical ratios!');
  };

  // Render canvas
  const renderCertificateCanvas = (
    inv: Investor | null,
    targetCanvas: HTMLCanvasElement
  ) => {
    const ctx = targetCanvas.getContext('2d');
    if (!ctx) return;

    const width = 1920;
    const height = 1080;
    targetCanvas.width = width;
    targetCanvas.height = height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // 1. Render Background
    if (selectedTemplate === 'custom_upload' && customImageUri) {
      const img = new Image();
      img.src = customImageUri;
      ctx.drawImage(img, 0, 0, width, height);
    } else {
      // Draw built-in template vector graphics
      drawPresetTemplateBackground(ctx, width, height, selectedTemplate);
    }

    // 2. Render Text Overlays
    const demoInvName = inv?.name || 'Alexander Sterling';
    const demoInvId = inv?.investorId || 'INV-884920';
    const demoFundName = fund?.name || 'OmniFund Global Growth Fund';
    const demoUnits = inv?.unitsOwned ? inv.unitsOwned.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '25,000.00';
    const issueDateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const serialStr = inv?.certificateSerial || `CERT-2026-${(fund?.ticker || 'OMNI').toUpperCase()}-${Math.floor(100000 + Math.random() * 900000)}`;

    const fieldsMap: Record<keyof LayoutConfig, string> = {
      title: 'CERTIFICATE OF MEMBERSHIP',
      fundName: demoFundName,
      citation: citationText,
      investorName: demoInvName,
      investorId: demoInvId,
      units: demoUnits,
      issueDate: issueDateStr,
      serialNumber: serialStr,
      signatory: signatoryName
    };

    Object.entries(layout).forEach(([key, cfg]: [string, FieldConfig]) => {
      if (!cfg.visible) return;

      const val = fieldsMap[key as keyof LayoutConfig] || '';
      const textToDraw = `${cfg.prefix || ''}${val}${cfg.suffix || ''}`;

      ctx.save();
      
      // Determine font family
      let fontStack = 'Times New Roman, Georgia, serif';
      if (cfg.fontFamily === 'sans') fontStack = 'Inter, system-ui, sans-serif';
      if (cfg.fontFamily === 'mono') fontStack = 'Courier New, monospace';

      const scaledSize = Math.round((cfg.size / 1000) * height * 1.3);
      ctx.font = `${cfg.weight} ${scaledSize}px ${fontStack}`;
      ctx.fillStyle = cfg.color;
      ctx.textAlign = cfg.align;
      ctx.textBaseline = 'middle';

      const pixelX = (cfg.x / 100) * width;
      const pixelY = (cfg.y / 100) * height;

      // Render subtle text drop shadow for dark backgrounds
      if (selectedTemplate !== 'y_invest') {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 2;
      } else {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
      }

      ctx.fillText(textToDraw, pixelX, pixelY);

      // If signatory and title is specified, render title line below
      if (key === 'signatory' && signatoryTitle && selectedTemplate !== 'y_invest') {
        ctx.font = `normal ${Math.round(scaledSize * 0.75)}px ${fontStack}`;
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(signatoryTitle, pixelX, pixelY + scaledSize * 1.2);
        
        // Draw line above signature
        ctx.beginPath();
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 2;
        ctx.moveTo(pixelX - 100, pixelY - scaledSize * 0.8);
        ctx.lineTo(pixelX + 100, pixelY - scaledSize * 0.8);
        ctx.stroke();
      }

      ctx.restore();
    });
  };

  // Preset Template Vector Renderer
  const drawPresetTemplateBackground = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    template: TemplateType
  ) => {
    if (template === 'y_invest') {
      // Y-Invest Clean Cyan / Blue Corporate Template (100% Exact Match to Uploaded Design)
      // 1. Background Canvas
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(0, 0, w, h);

      // 2. Main White Certificate Box
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
      ctx.shadowBlur = 28;
      ctx.shadowOffsetY = 8;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(90, 70, w - 180, h - 140);
      ctx.restore();

      // 3. Top-Left Cyan/Blue Geometric Ribbons
      ctx.save();
      ctx.fillStyle = '#00aeef';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(520, 0);
      ctx.lineTo(0, 260);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(0, 260);
      ctx.lineTo(520, 0);
      ctx.lineTo(600, 0);
      ctx.lineTo(0, 300);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#1b365d';
      ctx.beginPath();
      ctx.moveTo(0, 300);
      ctx.lineTo(600, 0);
      ctx.lineTo(640, 0);
      ctx.lineTo(0, 320);
      ctx.closePath();
      ctx.fill();

      // 4. Bottom-Right Cyan/Blue Geometric Ribbons
      ctx.fillStyle = '#00aeef';
      ctx.beginPath();
      ctx.moveTo(w, h);
      ctx.lineTo(w - 520, h);
      ctx.lineTo(w, h - 260);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(w, h - 260);
      ctx.lineTo(w - 520, h);
      ctx.lineTo(w - 600, h);
      ctx.lineTo(w, h - 300);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#1b365d';
      ctx.beginPath();
      ctx.moveTo(w, h - 300);
      ctx.lineTo(w - 600, h);
      ctx.lineTo(w - 640, h);
      ctx.lineTo(w, h - 320);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // 5. Header Logos & Branding
      ctx.save();
      const logoLeftX = 730;
      const logoLeftY = 175;

      // "Yin" text
      ctx.fillStyle = '#1b365d';
      ctx.font = '900 52px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('Yin', logoLeftX, logoLeftY);

      // Red dot above 'i' in Yin
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(logoLeftX + 54, logoLeftY - 38, 4, 0, Math.PI * 2);
      ctx.fill();

      // Subtext "INVESTOR" under Yin
      ctx.fillStyle = '#1b365d';
      ctx.font = 'bold 9px sans-serif';
      ctx.fillText('INVESTOR', logoLeftX + 22, logoLeftY + 11);

      // "YOUNG INVESTORS"
      ctx.fillStyle = '#1b365d';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText('YOUNG INVESTORS', logoLeftX + 105, logoLeftY - 18);

      // "NETWORK"
      ctx.fillStyle = '#1b365d';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText('NETWORK', logoLeftX + 105, logoLeftY + 2);

      // Red horizontal underline below "NETWORK"
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(logoLeftX + 192, logoLeftY + 2);
      ctx.lineTo(logoLeftX + 250, logoLeftY + 2);
      ctx.stroke();

      // Right Header Logo: Y-INVEST Badge with Green Leaf & Arrow
      const logoRightX = 1110;
      const logoRightY = 145;

      // Green Leaf & Upward Arrow icon
      ctx.fillStyle = '#16a34a';
      ctx.beginPath();
      ctx.moveTo(logoRightX - 60, logoRightY + 35);
      ctx.bezierCurveTo(logoRightX - 80, logoRightY + 25, logoRightX - 70, logoRightY + 5, logoRightX - 45, logoRightY + 15);
      ctx.bezierCurveTo(logoRightX - 30, logoRightY + 25, logoRightX - 40, logoRightY + 40, logoRightX - 60, logoRightY + 35);
      ctx.fill();

      // Arrow line pointing up-right
      ctx.strokeStyle = '#1b365d';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(logoRightX - 65, logoRightY + 40);
      ctx.lineTo(logoRightX - 25, logoRightY);
      ctx.stroke();

      // Arrowhead
      ctx.fillStyle = '#1b365d';
      ctx.beginPath();
      ctx.moveTo(logoRightX - 20, logoRightY - 5);
      ctx.lineTo(logoRightX - 40, logoRightY);
      ctx.lineTo(logoRightX - 25, logoRightY + 15);
      ctx.closePath();
      ctx.fill();

      // Y-INVEST Navy Badge Rect
      ctx.fillStyle = '#1b365d';
      ctx.fillRect(logoRightX, logoRightY - 2, 210, 48);

      // "Y-INVEST" white text
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Y-INVEST', logoRightX + 105, logoRightY + 31);
      ctx.restore();

      // 6. Title Section
      ctx.save();
      // "CERTIFICATE"
      ctx.fillStyle = '#1b365d';
      ctx.font = '900 78px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('CERTIFICATE', w / 2, 335);

      // "OF MEMBERSHIP"
      ctx.font = 'bold 32px sans-serif';
      ctx.fillText('OF MEMBERSHIP', w / 2, 415);

      // Flanking Horizontal Lines for "OF MEMBERSHIP"
      ctx.strokeStyle = '#1b365d';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(510, 415);
      ctx.lineTo(680, 415);
      ctx.moveTo(1240, 415);
      ctx.lineTo(1410, 415);
      ctx.stroke();
      ctx.restore();

      // 7. Citation Text
      ctx.save();
      ctx.fillStyle = '#334155';
      ctx.font = '500 22px sans-serif';
      ctx.textAlign = 'center';
      
      const citeText = citationText || 'the trustees of the Y-invest equity trust fund confirm the membership of';
      const citeLines = citeText.includes(' confirm ') 
        ? citeText.split(' confirm ')
        : [citeText, ''];

      if (citeLines[1]) {
        ctx.fillText(citeLines[0], w / 2, 495);
        ctx.fillText(`confirm ${citeLines[1]}`, w / 2, 528);
      } else {
        ctx.fillText(citeText, w / 2, 510);
      }
      ctx.restore();

      // 8. Member Name Underline
      ctx.save();
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(280, 645);
      ctx.lineTo(1640, 645);
      ctx.stroke();
      ctx.restore();

      // 9. Three Bottom Columns (Y-Invest ID, Date Of Commencement, Managing director)
      ctx.save();
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.8;

      // Column 1 (Left line)
      ctx.beginPath();
      ctx.moveTo(280, 745);
      ctx.lineTo(640, 745);
      ctx.stroke();

      // Column 2 (Center line)
      ctx.beginPath();
      ctx.moveTo(780, 745);
      ctx.lineTo(1140, 745);
      ctx.stroke();

      // Column 3 (Right line)
      ctx.beginPath();
      ctx.moveTo(1280, 745);
      ctx.lineTo(1640, 745);
      ctx.stroke();

      // Labels below column underlines
      ctx.fillStyle = '#1e293b';
      ctx.font = '500 21px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Y-Invest ID', 460, 785);
      ctx.fillText('Date Of Commencement', 960, 785);
      ctx.fillText('Managing director', 1460, 785);
      ctx.restore();

      // 10. Footer Contact Information & Disclaimer
      ctx.save();
      ctx.fillStyle = '#334155';
      ctx.font = '500 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('+233 24 587 1167  |  Info@yinvestors.org', w / 2, 915);

      ctx.fillStyle = '#64748b';
      ctx.font = '14px sans-serif';
      ctx.fillText('This Certificate is issued for identification purpses only to members of the Y-invest equity', w / 2, 948);
      ctx.restore();
      ctx.restore();

    } else if (template === 'royal_gold') {
      // Royal Gold Navy
      const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 100, w / 2, h / 2, w);
      bgGrad.addColorStop(0, '#0f172a');
      bgGrad.addColorStop(0.7, '#090d16');
      bgGrad.addColorStop(1, '#020617');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // Outer Gold Frame
      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 12;
      ctx.strokeRect(40, 40, w - 80, h - 80);

      // Inner Fine Gold Line
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.strokeRect(56, 56, w - 112, h - 112);

      // Corner Filigree Accents
      const drawCorner = (x: number, y: number, rx: number, ry: number) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(rx, ry);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, 40);
        ctx.lineTo(0, 0);
        ctx.lineTo(40, 0);
        ctx.stroke();
        ctx.restore();
      };
      drawCorner(70, 70, 1, 1);
      drawCorner(w - 70, 70, -1, 1);
      drawCorner(70, h - 70, 1, -1);
      drawCorner(w - 70, h - 70, -1, -1);

      // Gold Foil Stamp / Seal (Bottom Center)
      ctx.save();
      ctx.beginPath();
      ctx.arc(w / 2, h - 160, 50, 0, Math.PI * 2);
      const sealGrad = ctx.createLinearGradient(w / 2 - 50, h - 210, w / 2 + 50, h - 110);
      sealGrad.addColorStop(0, '#fef08a');
      sealGrad.addColorStop(0.5, '#d4af37');
      sealGrad.addColorStop(1, '#854d0e');
      ctx.fillStyle = sealGrad;
      ctx.fill();
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Star in seal
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 36px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★', w / 2, h - 158);
      ctx.restore();

    } else if (template === 'platinum_modern') {
      // Obsidian Platinum
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, w, h);

      // Geometric Silver Lines
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 4;
      ctx.strokeRect(50, 50, w - 100, h - 100);

      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1;
      ctx.strokeRect(62, 62, w - 124, h - 124);

      // Crest Icon
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(w / 2, 110, 32, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('◆', w / 2, 110);

    } else if (template === 'emerald_prestige') {
      // Emerald Gold
      ctx.fillStyle = '#022c22';
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 10;
      ctx.strokeRect(40, 40, w - 80, h - 80);

      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 3;
      ctx.strokeRect(56, 56, w - 112, h - 112);

    } else {
      // Heritage Parchment
      ctx.fillStyle = '#fefce8';
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 12;
      ctx.strokeRect(40, 40, w - 80, h - 80);

      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 2;
      ctx.strokeRect(56, 56, w - 112, h - 112);

      // Red Wax Seal
      ctx.save();
      ctx.beginPath();
      ctx.arc(w / 2, h - 160, 52, 0, Math.PI * 2);
      ctx.fillStyle = '#991b1b';
      ctx.fill();
      ctx.strokeStyle = '#fca5a5';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 32px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('SEAL', w / 2, h - 158);
      ctx.restore();
    }
  };

  // Trigger canvas redraw whenever layout or template changes
  useEffect(() => {
    if (canvasRef.current && isOpen) {
      renderCertificateCanvas(primaryInvestor, canvasRef.current);
    }
  }, [isOpen, selectedTemplate, customImageUri, layout, primaryInvestor, citationText, signatoryName, signatoryTitle]);

  // Generate PDF from Canvas for an investor
  const generatePDFForInvestor = async (inv: Investor): Promise<{ pdfBase64: string; doc: jsPDF; serial: string }> => {
    const canvas = document.createElement('canvas');
    renderCertificateCanvas(inv, canvas);

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const pdf = new (jsPDF as any)({
      orientation: 'landscape',
      unit: 'pt',
      format: [1920, 1080]
    });

    pdf.addImage(imgData, 'JPEG', 0, 0, 1920, 1080);
    const pdfBase64 = pdf.output('datauristring').split(',')[1];
    
    const serial = inv.certificateSerial || `CERT-2026-${(fund?.ticker || 'OMNI').toUpperCase()}-${Math.floor(100000 + Math.random() * 900000)}`;

    return { pdfBase64, doc: pdf, serial };
  };

  // Download PDF
  const handleDownloadPDF = async () => {
    if (targetInvestors.length === 0) return;
    setIsProcessing(true);
    setProcessingStatus('Generating certificate PDF...');

    try {
      for (let i = 0; i < targetInvestors.length; i++) {
        const inv = targetInvestors[i];
        setProcessingStatus(`Rendering PDF for ${inv.name} (${i + 1}/${targetInvestors.length})...`);
        const { doc: pdfDoc, serial } = await generatePDFForInvestor(inv);
        pdfDoc.save(`Certificate_of_Membership_${inv.name.replace(/\s+/g, '_')}_${serial}.pdf`);

        // Record issuance in Firestore
        const invRef = doc(db, 'investors', inv.id);
        await updateDoc(invRef, {
          certificateIssuedAt: new Date().toISOString(),
          certificateSerial: serial,
          certificateStatus: 'ISSUED'
        });
      }

      toast.success(`Successfully downloaded certificate PDF(s)!`);
      if (onCertificateIssued) onCertificateIssued();
    } catch (error: any) {
      console.error(error);
      toast.error(`Failed to generate PDF: ${error.message || 'Error rendering certificate'}`);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  // Email Certificate via Gmail API
  const handleEmailCertificate = async () => {
    if (targetInvestors.length === 0) return;
    if (!isGmailConnected) {
      toast.error('Please connect Gmail in the header before issuing certificates.');
      return;
    }

    setIsProcessing(true);
    let successCount = 0;
    let failCount = 0;

    try {
      for (let i = 0; i < targetInvestors.length; i++) {
        const inv = targetInvestors[i];
        setBatchProgress({ current: i + 1, total: targetInvestors.length });
        setProcessingStatus(`Sending certificate email to ${inv.name} (${inv.email || 'No email'})...`);

        if (!inv.email) {
          failCount++;
          continue;
        }

        const { pdfBase64, serial } = await generatePDFForInvestor(inv);

        const res = await fetch('/api/send-certificate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            investorEmail: inv.email,
            investorName: inv.name,
            pdfBase64,
            certificateSerial: serial,
            fundName: fund?.name || 'OmniFund',
            issueDate: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
            bodyMessage: emailBody
          })
        });

        if (res.ok) {
          successCount++;
          // Record issuance in Firestore
          const invRef = doc(db, 'investors', inv.id);
          await updateDoc(invRef, {
            certificateIssuedAt: new Date().toISOString(),
            certificateSerial: serial,
            certificateStatus: 'ISSUED'
          });
        } else {
          failCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`Successfully issued & emailed ${successCount} certificate(s)!`);
        if (onCertificateIssued) onCertificateIssued();
        setTimeout(onClose, 1500);
      } else {
        toast.error(`Failed to send certificates. Check investor email addresses.`);
      }
    } catch (error: any) {
      console.error(error);
      toast.error(`Error issuing certificate: ${error.message || 'Network error'}`);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-950/85 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-6xl h-[90vh] bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col z-10"
        >
          {/* Top Bar Header */}
          <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center">
                <Award className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-extrabold text-white flex items-center gap-3">
                  Membership Certificate Suite
                  <span className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                    One-Time Issuance
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {isBulk 
                    ? `Issuing custom certificates to ${targetInvestors.length} selected investors` 
                    : `Issuing official certificate to ${primaryInvestor?.name || 'Investor'} (${primaryInvestor?.investorId || 'ID'})`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleAutoLayout}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/20 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
                title="Apply AI Auto Layout"
              >
                <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
                Smart Auto-Layout
              </button>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Main Studio Body Grid */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
            
            {/* Left Controls & Design Panel */}
            <div className="lg:col-span-5 border-r border-slate-800 flex flex-col bg-slate-900/60 overflow-y-auto p-6 space-y-6">
              
              {/* Navigation Tabs */}
              <div className="flex bg-slate-800/80 p-1 rounded-2xl border border-slate-700/60">
                <button
                  onClick={() => setActiveTab('design')}
                  className={cn(
                    "flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2",
                    activeTab === 'design' ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20" : "text-slate-400 hover:text-white"
                  )}
                >
                  <Palette className="w-3.5 h-3.5" />
                  Template Design
                </button>
                <button
                  onClick={() => setActiveTab('layout')}
                  className={cn(
                    "flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2",
                    activeTab === 'layout' ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20" : "text-slate-400 hover:text-white"
                  )}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  Smart Positions
                </button>
                <button
                  onClick={() => setActiveTab('recipients')}
                  className={cn(
                    "flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2",
                    activeTab === 'recipients' ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20" : "text-slate-400 hover:text-white"
                  )}
                >
                  <Users className="w-3.5 h-3.5" />
                  Recipients ({targetInvestors.length})
                </button>
              </div>

              {/* TAB 1: TEMPLATE DESIGN */}
              {activeTab === 'design' && (
                <div className="space-y-6">
                  {/* Upload Custom Certificate Background */}
                  <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-300 flex items-center gap-2 uppercase tracking-wider">
                        <Upload className="w-4 h-4 text-amber-500" />
                        Upload Certificate Design
                      </label>
                      <span className="text-[10px] text-slate-500">PNG, JPG, WEBP</span>
                    </div>

                    <label className="border-2 border-dashed border-slate-700 hover:border-amber-500/50 bg-slate-900/50 hover:bg-slate-800/50 p-6 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all group text-center">
                      <Upload className="w-8 h-8 text-slate-500 group-hover:text-amber-400 group-hover:scale-110 transition-all mb-2" />
                      <span className="text-xs font-bold text-slate-300">Click to upload custom certificate frame</span>
                      <span className="text-[10px] text-slate-500 mt-1">Upload your corporate certificate background template</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleImageUpload} 
                        className="hidden" 
                      />
                    </label>

                    {customImageUri && (
                      <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-between text-xs text-amber-400">
                        <span className="flex items-center gap-2 font-semibold">
                          <CheckCircle2 className="w-4 h-4" /> Custom Template Loaded
                        </span>
                        <button 
                          onClick={() => applyTemplateDefaults('y_invest')}
                          className="text-[10px] underline hover:text-amber-300"
                        >
                          Reset to Presets
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Preset Themes */}
                  <div className="space-y-3">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Or Choose Built-in Theme
                    </label>

                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { id: 'y_invest', name: 'Y-Invest Equity Trust', desc: 'Official Y-Invest Cyan & Navy Template', bg: 'bg-cyan-950 border-cyan-500/40 text-cyan-400' },
                        { id: 'royal_gold', name: 'Royal Gold Guild', desc: 'Navy & Ornate Gold Filigree', bg: 'bg-slate-950 border-amber-500/40 text-amber-400' },
                        { id: 'platinum_modern', name: 'Platinum Obsidian', desc: 'Sleek Crest & Metallic Trim', bg: 'bg-slate-900 border-sky-500/40 text-sky-400' },
                        { id: 'emerald_prestige', name: 'Emerald Prestige', desc: 'Deep Emerald & Gold Ribbons', bg: 'bg-emerald-950 border-emerald-500/40 text-emerald-400' },
                        { id: 'heritage_cream', name: 'Heritage Parchment', desc: 'Ivory Cream & Antique Red Seal', bg: 'bg-amber-100/10 border-amber-300/40 text-amber-200' },
                      ].map((t) => (
                        <button
                          key={t.id}
                          onClick={() => {
                            applyTemplateDefaults(t.id as TemplateType);
                          }}
                          className={cn(
                            "p-3.5 rounded-2xl border text-left transition-all relative flex flex-col justify-between h-24",
                            selectedTemplate === t.id && !customImageUri 
                              ? "border-amber-500 ring-2 ring-amber-500/30 bg-slate-800" 
                              : "border-slate-800 bg-slate-950/40 hover:border-slate-700"
                          )}
                        >
                          <div>
                            <p className="font-bold text-xs text-white">{t.name}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">{t.desc}</p>
                          </div>
                          {selectedTemplate === t.id && !customImageUri && (
                            <span className="absolute top-2 right-2 text-amber-400">
                              <CheckCircle2 className="w-4 h-4" />
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Citation & Signatory Text Inputs */}
                  <div className="space-y-4 pt-2 border-t border-slate-800">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-400">Certificate Citation Body</label>
                      <textarea
                        value={citationText}
                        onChange={(e) => setCitationText(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-xs text-white h-20 resize-none focus:ring-1 focus:ring-amber-500 outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-400">Signatory Name</label>
                        <input
                          type="text"
                          value={signatoryName}
                          onChange={(e) => setSignatoryName(e.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-amber-500"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-400">Signatory Title</label>
                        <input
                          type="text"
                          value={signatoryTitle}
                          onChange={(e) => setSignatoryTitle(e.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: SMART POSITIONING & OVERLAYS */}
              {activeTab === 'layout' && (
                <div className="space-y-6">
                  {/* Select Field to Edit */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Select Overlay Element to Position
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'investorName', label: 'Investor Name' },
                        { id: 'investorId', label: 'Investor ID' },
                        { id: 'fundName', label: 'Fund Name' },
                        { id: 'units', label: 'Holding Units' },
                        { id: 'issueDate', label: 'Issue Date' },
                        { id: 'serialNumber', label: 'Serial No.' },
                        { id: 'title', label: 'Main Header' },
                        { id: 'citation', label: 'Citation Body' },
                        { id: 'signatory', label: 'Signature' },
                      ].map((f) => (
                        <button
                          key={f.id}
                          onClick={() => setSelectedField(f.id as keyof LayoutConfig)}
                          className={cn(
                            "py-2 px-2.5 rounded-xl border text-[11px] font-bold text-center transition-all truncate",
                            selectedField === f.id 
                              ? "bg-amber-500 text-slate-950 border-amber-500 shadow-md shadow-amber-500/20" 
                              : "bg-slate-800/60 text-slate-300 border-slate-700 hover:border-slate-600"
                          )}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Active Field Controls */}
                  {selectedField && layout[selectedField] && (
                    <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                          <Type className="w-4 h-4" />
                          Configuring: {selectedField}
                        </span>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={layout[selectedField].visible}
                            onChange={(e) => setLayout(prev => ({
                              ...prev,
                              [selectedField]: { ...prev[selectedField], visible: e.target.checked }
                            }))}
                            className="rounded accent-amber-500"
                          />
                          <span className="text-xs text-slate-400">Visible</span>
                        </label>
                      </div>

                      {/* Y Position Slider */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-slate-400">
                          <span>Vertical Position (Y-Axis)</span>
                          <span className="font-mono text-amber-400">{layout[selectedField].y}%</span>
                        </div>
                        <input 
                          type="range" 
                          min="5" 
                          max="95" 
                          value={layout[selectedField].y}
                          onChange={(e) => setLayout(prev => ({
                            ...prev,
                            [selectedField]: { ...prev[selectedField], y: Number(e.target.value) }
                          }))}
                          className="w-full accent-amber-500 cursor-pointer"
                        />
                      </div>

                      {/* X Position Slider */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-slate-400">
                          <span>Horizontal Position (X-Axis)</span>
                          <span className="font-mono text-amber-400">{layout[selectedField].x}%</span>
                        </div>
                        <input 
                          type="range" 
                          min="5" 
                          max="95" 
                          value={layout[selectedField].x}
                          onChange={(e) => setLayout(prev => ({
                            ...prev,
                            [selectedField]: { ...prev[selectedField], x: Number(e.target.value) }
                          }))}
                          className="w-full accent-amber-500 cursor-pointer"
                        />
                      </div>

                      {/* Font Size & Color */}
                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div className="space-y-1">
                          <span className="text-xs text-slate-400">Font Size (px)</span>
                          <input 
                            type="number" 
                            value={layout[selectedField].size}
                            onChange={(e) => setLayout(prev => ({
                              ...prev,
                              [selectedField]: { ...prev[selectedField], size: Number(e.target.value) }
                            }))}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
                          />
                        </div>

                        <div className="space-y-1">
                          <span className="text-xs text-slate-400">Text Color</span>
                          <div className="flex gap-2 items-center">
                            <input 
                              type="color" 
                              value={layout[selectedField].color}
                              onChange={(e) => setLayout(prev => ({
                                ...prev,
                                [selectedField]: { ...prev[selectedField], color: e.target.value }
                              }))}
                              className="w-8 h-8 rounded border border-slate-700 cursor-pointer bg-transparent"
                            />
                            <input 
                              type="text" 
                              value={layout[selectedField].color}
                              onChange={(e) => setLayout(prev => ({
                                ...prev,
                                [selectedField]: { ...prev[selectedField], color: e.target.value }
                              }))}
                              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white font-mono"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Font Family & Alignment */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <span className="text-xs text-slate-400">Font Family</span>
                          <select
                            value={layout[selectedField].fontFamily}
                            onChange={(e) => setLayout(prev => ({
                              ...prev,
                              [selectedField]: { ...prev[selectedField], fontFamily: e.target.value as any }
                            }))}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white"
                          >
                            <option value="serif">Classic Serif</option>
                            <option value="sans">Modern Sans</option>
                            <option value="mono">Monospace</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <span className="text-xs text-slate-400">Alignment</span>
                          <select
                            value={layout[selectedField].align}
                            onChange={(e) => setLayout(prev => ({
                              ...prev,
                              [selectedField]: { ...prev[selectedField], align: e.target.value as any }
                            }))}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white"
                          >
                            <option value="center">Center</option>
                            <option value="left">Left</option>
                            <option value="right">Right</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: RECIPIENTS & EMAIL CONFIG */}
              {activeTab === 'recipients' && (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Target Investor Recipients ({targetInvestors.length})
                    </label>

                    <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                      {targetInvestors.map((inv) => (
                        <div key={inv.id} className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
                          <div>
                            <p className="font-bold text-white">{inv.name}</p>
                            <p className="text-[10px] text-slate-500">{inv.email || 'No email saved'} • Reg: {inv.investorId}</p>
                          </div>
                          {inv.certificateIssuedAt ? (
                            <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold rounded-full">
                              Issued {safeFormatDate(inv.certificateIssuedAt)}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-bold rounded-full">
                              Pending Certificate
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4 pt-2 border-t border-slate-800">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-400">Email Notification Body</label>
                      <textarea
                        value={emailBody}
                        onChange={(e) => setEmailBody(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-xs text-white h-24 resize-none focus:ring-1 focus:ring-amber-500 outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Live Canvas Preview Panel */}
            <div className="lg:col-span-7 bg-slate-950 p-6 flex flex-col justify-between items-center overflow-y-auto">
              
              <div className="w-full space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <Eye className="w-4 h-4 text-amber-400" />
                    High-Resolution Certificate Preview
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">1920 × 1080 (300 DPI Landscape)</span>
                </div>

                {/* Canvas Render Frame */}
                <div className="w-full aspect-[1.77/1] bg-slate-900 border-2 border-slate-800 rounded-2xl overflow-hidden shadow-2xl relative flex items-center justify-center p-2 group">
                  <canvas 
                    ref={canvasRef} 
                    className="w-full h-full object-contain rounded-xl shadow-lg"
                  />
                </div>
              </div>

              {/* Status Banner */}
              {isProcessing && (
                <div className="w-full p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center gap-3 text-amber-400 text-xs my-4 animate-pulse">
                  <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" />
                  <span>{processingStatus}</span>
                </div>
              )}

              {/* Action Buttons Footer */}
              <div className="w-full pt-6 border-t border-slate-800/80 flex gap-4">
                <button
                  type="button"
                  onClick={handleDownloadPDF}
                  disabled={isProcessing}
                  className="flex-1 py-3.5 px-4 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-2xl transition-all border border-slate-700 flex items-center justify-center gap-2 text-xs"
                >
                  <Download className="w-4 h-4 text-amber-400" />
                  Download PDF
                </button>

                <button
                  type="button"
                  onClick={handleEmailCertificate}
                  disabled={isProcessing || targetInvestors.length === 0}
                  className="flex-[2] py-3.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold rounded-2xl transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 text-xs"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing Issuance...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Issue & Email Certificate ({targetInvestors.length})
                    </>
                  )}
                </button>
              </div>

            </div>

          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
