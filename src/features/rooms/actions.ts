"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/dal";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { databaseIdSchema } from "@/lib/validation/database-id";
import type { ActionState } from "@/types/hospital";

const schema=z.object({id:z.string().optional(),roomNumber:z.string().trim().min(1).max(30),bedNumber:z.string().trim().min(1).max(30),floor:z.string().trim().min(1).max(50),roomType:z.string().trim().max(50).optional(),active:z.string().optional()});
export async function saveRoomBed(_:ActionState,formData:FormData):Promise<ActionState>{
  await requirePermission("configureRooms"); const parsed=schema.safeParse(Object.fromEntries(formData));
  if(!parsed.success)return{ok:false,fieldErrors:parsed.error.flatten().fieldErrors};
  const supabase=createSupabaseAdminClient(); const values={room_number:parsed.data.roomNumber,bed_number:parsed.data.bedNumber,floor:parsed.data.floor,room_type:parsed.data.roomType||null,active:parsed.data.active==="on"};
  const id=parsed.data.id?databaseIdSchema.safeParse(parsed.data.id):null;
  const result=id?.success?await supabase.from("room_beds").update(values).eq("id",id.data):await supabase.from("room_beds").insert(values);
  if(result.error){
    if(result.error.code==="23505")return{ok:false,message:"This room and bed already exists."};
    if(result.error.code==="42P01"||result.error.code==="PGRST205")return{ok:false,message:"Rooms database setup is unavailable. Apply the latest Supabase migration."};
    return{ok:false,message:`Room/bed could not be saved (database code ${result.error.code||"unknown"}).`};
  }
  revalidatePath("/admin/masters");revalidatePath("/ip");return{ok:true,message:"Room/bed saved."};
}
