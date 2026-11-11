const headers={"Access-Control-Allow-Origin":"https://aldous001.github.io","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json","Cache-Control":"no-store"};
Deno.serve(async(req)=>{
 const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST")return reply({message:"Method not allowed"},405);
 try{
 const input=await req.json();const username=String(input.username||"").trim().toLowerCase();const password=String(input.password||"");
 if(!/^[a-z0-9_]{3,32}$/.test(username)||password.length<6||password.length>1024)return reply({message:"用户名或密码错误"},401);
 const base=Deno.env.get("SUPABASE_URL");const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 const adminHeaders={apikey:key,Authorization:"Bearer "+key};
 const lookup=await fetch(base+"/rest/v1/nav_login_names?username=eq."+encodeURIComponent(username)+"&select=user_id",{headers:adminHeaders});
 if(!lookup.ok)return reply({message:"登录服务暂时不可用"},503);
 const names=await lookup.json();let email="invalid-login@invalid.example";let enabled=false;
 if(names.length){
 const member=await fetch(base+"/rest/v1/nav_members?user_id=eq."+names[0].user_id+"&enabled=eq.true&select=user_id",{headers:adminHeaders});
 if(!member.ok)return reply({message:"登录服务暂时不可用"},503);
 enabled=(await member.json()).length>0;
 const user=await fetch(base+"/auth/v1/admin/users/"+names[0].user_id,{headers:adminHeaders});
 if(user.ok)email=(await user.json()).email||email;
 }
 const auth=await fetch(base+"/auth/v1/token?grant_type=password",{method:"POST",headers:{apikey:Deno.env.get("SUPABASE_ANON_KEY"),"Content-Type":"application/json"},body:JSON.stringify({email,password})});
 const result=await auth.json();
 if(!auth.ok||!enabled)return reply({message:"用户名或密码错误"},auth.status===429?429:401);
 return reply(result);
 }catch{return reply({message:"登录服务暂时不可用"},503);}
});