import {describe,expect,it} from 'vitest';
import {canAdministerMember,roleAllows,type PolicyRole} from '@/app/api/[...path]/role-policy';

describe('case API role matrix',()=>{
  const roles:PolicyRole[]=['OWNER','CO_ADMIN','CAREGIVER','VIEWER'];
  it('separates read, write and manage capabilities',()=>{
    expect(roles.map(role=>[role,roleAllows(role,'read'),roleAllows(role,'write'),roleAllows(role,'manage')])).toEqual([
      ['OWNER',true,true,true],['CO_ADMIN',true,true,true],['CAREGIVER',true,true,false],['VIEWER',true,false,false],
    ]);
  });
  it('protects owner and self from role changes and removal',()=>{
    expect(canAdministerMember('OWNER','owner','OWNER','owner2','VIEWER')).toBe(false);
    expect(canAdministerMember('OWNER','owner','CAREGIVER','owner','VIEWER')).toBe(false);
    expect(canAdministerMember('OWNER','owner','CAREGIVER','care','CO_ADMIN')).toBe(true);
  });
  it('prevents co-admin privilege escalation and peer removal',()=>{
    expect(canAdministerMember('CO_ADMIN','manager','CAREGIVER','care','VIEWER')).toBe(true);
    expect(canAdministerMember('CO_ADMIN','manager','VIEWER','viewer','CO_ADMIN')).toBe(false);
    expect(canAdministerMember('CO_ADMIN','manager','CO_ADMIN','peer','VIEWER')).toBe(false);
    expect(canAdministerMember('CAREGIVER','care','VIEWER','viewer','CAREGIVER')).toBe(false);
  });
  it('allows co-admin to manage only caregiver/viewer invitations',()=>{
    expect(canAdministerMember('CO_ADMIN','manager','VIEWER','invite:care','CAREGIVER')).toBe(true);
    expect(canAdministerMember('CO_ADMIN','manager','VIEWER','invite:manager','CO_ADMIN')).toBe(false);
    expect(canAdministerMember('CO_ADMIN','manager','CO_ADMIN','invite:existing-manager')).toBe(false);
    expect(canAdministerMember('OWNER','owner','CO_ADMIN','invite:existing-manager')).toBe(true);
  });
});
