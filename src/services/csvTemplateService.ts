/**
 * OmniFund Pro — Global Standard CSV Template Generator Service
 * Generates and triggers browser downloads for official bulk upload CSV templates.
 */

/**
 * Transaction Registry Bulk Upload CSV Template
 */
export function downloadTransactionRegistryTemplate() {
  const headers = [
    'Transaction Date',
    'Investor ID',
    'Investor Name',
    'Transaction Type',
    'Gross Amount',
    'Units',
    'Fee',
    'Payment Reference',
    'Email Address',
    'Phone Number'
  ];

  const sampleRows = [
    ['2026-04-24', 'INV-001', 'Joshua Kwei Mensah', 'Subscription', '5000.00', '', '0.00', 'REF-BANK-1001', 'joshua@fund.com', '0244123456'],
    ['2026-04-24', 'INV-002', 'Abena Osei', 'Subscription', '15000.00', '', '0.00', 'REF-BANK-1002', 'abena@fund.com', '0244987654'],
    ['2026-04-25', 'INV-003', 'Fiakpo Divine', 'Redemption', '2000.00', '', '50.00', 'REF-RED-2001', 'divine@fund.com', '0555123456'],
    ['2026-04-26', 'INV-004', 'Peter Yaw Adu-Amoah', 'Contribution', '3500.00', '', '0.00', 'REF-BANK-1003', 'peter@fund.com', '0200112233']
  ];

  const csvContent = [
    headers.join(','),
    ...sampleRows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'OmniFund_Transaction_Registry_Template.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Investor Master Data Import CSV Template (Mode A)
 */
export function downloadInvestorMasterTemplate() {
  const headers = [
    'Investor ID',
    'Full Name',
    'Email Address',
    'Phone Number',
    'Address',
    'KYC Status'
  ];

  const sampleRows = [
    ['INV-001', 'Abena Osei', 'abena.osei@example.com', '0244123456', 'East Legon, Accra', 'verified'],
    ['INV-002', 'Kofi Mensah', 'kofi.mensah@example.com', '0200987654', 'Airport Residential, Accra', 'verified'],
    ['', 'Kwame Nkrumah', 'kwame@example.com', '0555112233', 'Kumasi, Ghana', 'pending']
  ];

  const csvContent = [
    headers.join(','),
    ...sampleRows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'OmniFund_Investor_Master_Template.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Investor Financial Investment Import CSV Template (Mode B)
 */
export function downloadInvestorFinancialTemplate() {
  const headers = [
    'Transaction Date',
    'Investor ID',
    'Full Name',
    'Email Address',
    'Phone Number',
    'Investment Amount',
    'Units',
    'Transaction Type'
  ];

  const sampleRows = [
    ['2026-04-24', 'INV-001', 'Abena Osei', 'abena.osei@example.com', '0244123456', '1000.00', '', 'Subscription'],
    ['2026-04-24', 'INV-002', 'Kofi Mensah', 'kofi.mensah@example.com', '0200987654', '5000.00', '', 'Contribution'],
    ['2026-04-25', '', 'Yaw Berko', 'yaw.berko@example.com', '0555443322', '2500.00', '', 'Subscription']
  ];

  const csvContent = [
    headers.join(','),
    ...sampleRows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'OmniFund_Investor_Financial_Investment_Template.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
