// States and union territories — the key for state-wise statutory rules
// (Professional Tax, Labour Welfare Fund).
export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim',
  'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir',
  'Ladakh', 'Lakshadweep', 'Puducherry',
];

// Deductor categories as listed on the quarterly TDS return.
export const DEDUCTOR_TYPES = [
  'Company', 'Branch / Division of Company', 'Firm',
  'Association of Persons (AOP)', 'Association of Persons (Trust)',
  'Body of Individuals', 'Individual / HUF', 'Artificial Juridical Person',
  'Central Government', 'State Government', 'Statutory Body',
  'Autonomous Body', 'Local Authority',
];

export const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const TAN_PATTERN = /^[A-Z]{4}[0-9]{5}[A-Z]$/;
