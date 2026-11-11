const h={"Access-Control-Allow-Origin":"https://aldous001.github.io","Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json","Cache-Control":"no-store"};
Deno.serve(async req=>{
 const reply=(b,s=200)=>new Response(JSON.stringify(b),{status:s,headers:h});
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:h});
 if(req.method!=="POST")return reply({message:"Method not allowed"},405);
 const base=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 const sh={apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"};
 async function api(path,method="GET",body){const r=await fetch(base+path,{method,headers:sh,...(body===undefined?{}:{body:JSON.stringify(body)})});const b=await r.json().catch(()=>null);if(!r.ok)throw Error("账号操作失败，请检查用户名是否重复或密码是否符合要求");return b;}
 try{
 const bearer=req.headers.get("Authorization")||"";
 const auth=await fetch(base+"/auth/v1/user",{headers:{apikey:Deno.env.get("SUPABASE_ANON_KEY"),Authorization:bearer}});
 if(!auth.ok)return reply({message:"请重新登录"},401);
 const me=await auth.json();
 const admins=await api("/rest/v1/nav_admins?user_id=eq."+me.id+"&select=user_id");
 if(!admins.length)return reply({message:"需要管理员权限"},403);
 const x=await req.json();
 if(x.action==="list"){const names=await api("/rest/v1/nav_login_names?select=username,user_id&order=username");const members=await api("/rest/v1/nav_members?select=user_id,enabled");return reply({users:names.map(n=>({...n,enabled:members.some(m=>m.user_id===n.user_id&&m.enabled),self:n.user_id===me.id}))});}
 const username=String(x.username||"").trim().toLowerCase();
 if(!/^[a-z0-9_]{3,32}$/.test(username))return reply({message:"用户名需为3至32位字母、数字或下划线"},400);
 const password=String(x.password||"");
 if((x.action==="create"||password)&& (password.length<6||password.length>128))return reply({message:"密码需为6至128位"},400);
 if(x.action==="create"){
 if((await api("/rest/v1/nav_login_names?username=eq."+username+"&select=user_id")).length)return reply({message:"用户名已存在"},409);
 const user=await api("/auth/v1/admin/users","POST",{email:crypto.randomUUID()+"@accounts.agri-navigation.invalid",password,email_confirm:true});
 try{await api("/rest/v1/nav_login_names","POST",{username,user_id:user.id});await api("/rest/v1/nav_members","POST",{user_id:user.id,enabled:true});}
 catch(e){await api("/auth/v1/admin/users/"+user.id,"DELETE");throw e;}
 return reply({success:true});
 }
 if(x.action==="update"){
 const id=String(x.user_id||"");if(!/^[a-f0-9-]{36}$/.test(id))return reply({message:"无效账号"},400);
 const existing=await api("/rest/v1/nav_login_names?user_id=eq."+id+"&select=username");
 if(!existing.length)return reply({message:"账号不存在"},404);
 if(id===me.id&&(x.enabled===false||username!==existing[0].username))return reply({message:"当前管理员账号请保持启用，且保留管理员用户名"},400);
 const duplicate=await api("/rest/v1/nav_login_names?username=eq."+username+"&select=user_id");
 if(duplicate.some(n=>n.user_id!==id))return reply({message:"用户名已存在"},409);
 if(password)await api("/auth/v1/admin/users/"+id,"PUT",{password});
 await api("/rest/v1/nav_login_names?user_id=eq."+id,"PATCH",{username});
 await api("/rest/v1/nav_members?user_id=eq."+id,"PATCH",{enabled:x.enabled!==false});
 return reply({success:true});
 }return reply({message:"未知操作"},400);
 }catch(e){return reply({message:e.message||"服务暂时不可用"},400);}
});