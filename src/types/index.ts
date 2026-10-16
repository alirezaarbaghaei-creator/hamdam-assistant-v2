export interface Profile {
  id: string;
  fullName: string;
  nationalId: string;
  employeeCode: string;
  organization: string;
  jobTitle: string;
  /** Extended fields that can be added by AI during letter creation */
  extraFields?: Record<string, string>;
  isDefault?: boolean;
  createdAt: number;
}

export type FieldType = 'text' | 'date' | 'textarea' | 'select' | 'number';

/** Named data sources for select fields — AI can reference these instead of inline options */
export type DataSourceId =
  | 'banks'
  | 'provinces'
  | 'cities'
  | 'countries'
  | 'universities'
  | 'ministries'
  | 'leaveTypes'
  | 'custom';

export interface LetterField {
  id: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  /** Inline options for select fields */
  options?: string[];
  /** Suggested default answers the user can pick from or override with custom text */
  defaultOptions?: string[];
  /** Reference to a named data source (banks, cities, etc.) */
  dataSource?: DataSourceId;
  required?: boolean;
  /** AI uses this hint to phrase a better question */
  hint?: string;
  /** If true, AI only asks when it improves quality */
  optional?: boolean;
  /** If true, this field can be reused from profile data */
  profileKey?: string;
  /** If true, AI should offer to save this field's value to the profile after letter completion */
  saveToProfile?: boolean;
}

export type LetterCategory =
  | 'administrative'
  | 'legal'
  | 'personal'
  | 'official'
  | 'financial'
  | 'hr'
  | 'contract'
  | 'document'
  | 'pledge'
  | 'agreement';

/** Tone of the letter — determines formality level and vocabulary style */
export type LetterTone = 'formal' | 'semi-formal' | 'informal' | 'friendly';

export interface LetterType {
  id: string;
  title: string;
  category: LetterCategory;
  description: string;
  icon: string;
  fields: LetterField[];
  /** Keywords for intent matching */
  keywords: string[];
  /** System prompt fragment for the AI */
  promptHint: string;
  /** If false, this letter type doesn't require profile data */
  needsProfile?: boolean;
  /** Tone of the letter — determines formality level */
  tone?: LetterTone;
}

export interface ChatMessage {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  /** Optional: field id this message is asking about */
  fieldId?: string;
  /** Optional: quick-reply options shown to user */
  options?: string[];
}

export interface GeneratedLetter {
  id: string;
  letterTypeId?: string;
  templateId: string;
  templateTitle: string;
  profileId: string | null;
  title: string;
  content: string;
  fieldValues: Record<string, string>;
  status: 'draft' | 'final';
  /** AI quality score 0-100 */
  qualityScore?: number;
  /** AI quality feedback */
  qualityFeedback?: string;
  /** User rating 1-5 stars for the generated letter */
  userRating?: number;
  createdAt: number;
  updatedAt: number;
}

export interface DiscoveredLetter {
  letterType: LetterType;
  title: string;
  category: LetterCategory;
  requiredFields: LetterField[];
  optionalFields: LetterField[];
  confidence: number;
  rawRequest: string;
  /** Whether this letter needs profile data */
  needsProfile: boolean;
  /** Tone of the letter — determines formality level */
  tone?: LetterTone;
}

/** Hamdam pages — legacy ids (templates/chat/…) are kept in the union so old
 *  saved references can't break the type, but only the new pages are routed. */
export type PageId = 'dashboard' | 'manager' | 'calendar' | 'tasks' | 'assistant' | 'more' | 'admin' | 'account' | 'pricing' | 'templates' | 'chat' | 'preview' | 'archive' | 'profile' | 'discovery' | 'drafts';

export interface SavedTemplate {
  id: string;
  letterType: LetterType;
  title: string;
  rawRequest: string;
  /** Average user rating 1-5 stars */
  rating: number;
  /** Number of ratings */
  ratingCount: number;
  /** Current user's own rating for this template, 0 if unrated */
  myRating?: number;
  /** Creator display name */
  creatorName?: string;
  /** Whether the current user is the owner */
  isOwner?: boolean;
  /** Whether admin has approved this template for public display */
  isApproved?: boolean;
  /** Preview of generated letter content */
  sampleContent?: string;
  createdAt: number;
}
