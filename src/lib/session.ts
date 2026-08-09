import 'server-only';

import {UserStatus} from '@prisma/client';
import {cookies} from 'next/headers';
import {ensureBootstrap,prisma,sha256} from '@/lib/database';

export type AuthenticatedUser={id:string;name:string};

export async function getAuthenticatedUser():Promise<AuthenticatedUser|null>{
  const token=(await cookies()).get('guardian_session')?.value;
  if(!token)return null;
  try{
    await ensureBootstrap();
    const session=await prisma.authSession.findUnique({
      where:{tokenHash:sha256(token)},
      select:{expiresAt:true,user:{select:{id:true,status:true,profile:{select:{displayName:true}}}}},
    });
    if(!session||session.expiresAt<=new Date()||session.user.status!==UserStatus.ACTIVE)return null;
    return {id:session.user.id,name:session.user.profile?.displayName??'보호자'};
  }catch{return null;}
}
