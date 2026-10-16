import * as api from '@/lib/api';
import type { Profile } from '@/types';

export interface ProfileRow {
  id: string;
  user_id: string;
  full_name: string;
  national_id: string;
  employee_code: string;
  organization: string;
  job_title: string;
  extra_fields: Record<string, string>;
  is_default: boolean;
  created_at: string;
}

function rowToProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    fullName: row.full_name,
    nationalId: row.national_id,
    employeeCode: row.employee_code,
    organization: row.organization,
    jobTitle: row.job_title,
    extraFields: row.extra_fields ?? {},
    isDefault: row.is_default,
    createdAt: new Date(row.created_at).getTime(),
  };
}

function profileToRow(p: Omit<Profile, 'id' | 'createdAt'>): Omit<ProfileRow, 'id' | 'user_id' | 'created_at'> {
  return {
    full_name: p.fullName,
    national_id: p.nationalId,
    employee_code: p.employeeCode,
    organization: p.organization,
    job_title: p.jobTitle,
    extra_fields: p.extraFields ?? {},
    is_default: p.isDefault ?? false,
  };
}

export async function fetchProfiles(): Promise<Profile[]> {
  try {
    const rows = await api.fetchProfilesApi();
    return (rows as ProfileRow[]).map(rowToProfile);
  } catch {
    return [];
  }
}

export async function createProfile(p: Omit<Profile, 'id' | 'createdAt'>): Promise<Profile | null> {
  try {
    const row = profileToRow(p);
    const res = await api.createProfileApi(row);
    return { ...p, id: res.id, createdAt: Date.now() };
  } catch {
    return null;
  }
}

export async function updateProfile(id: string, patch: Partial<Profile>): Promise<boolean> {
  const row: Record<string, unknown> = {};
  if (patch.fullName !== undefined) row.full_name = patch.fullName;
  if (patch.nationalId !== undefined) row.national_id = patch.nationalId;
  if (patch.employeeCode !== undefined) row.employee_code = patch.employeeCode;
  if (patch.organization !== undefined) row.organization = patch.organization;
  if (patch.jobTitle !== undefined) row.job_title = patch.jobTitle;
  if (patch.extraFields !== undefined) row.extra_fields = patch.extraFields;
  if (patch.isDefault !== undefined) row.is_default = patch.isDefault;
  try {
    await api.updateProfileApi(id, row);
    return true;
  } catch {
    return false;
  }
}

export async function deleteProfile(id: string): Promise<boolean> {
  try {
    await api.deleteProfileApi(id);
    return true;
  } catch {
    return false;
  }
}

export async function setDefaultProfile(id: string, allIds: string[]): Promise<boolean> {
  try {
    for (const pid of allIds) {
      await api.updateProfileApi(pid, { is_default: pid === id });
    }
    return true;
  } catch {
    return false;
  }
}
