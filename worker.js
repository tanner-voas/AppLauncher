/** Same-origin profile API gateway. No OAuth secrets are stored in AppLauncher. */
export default {
  async fetch(request,env){
    if(new URL(request.url).pathname.startsWith('/_git/v1/')){
      if(!env.GIT_MANAGER)return new Response('Git Manager service binding missing',{status:503});
      return env.GIT_MANAGER.fetch(request);
    }
    if(new URL(request.url).pathname.startsWith('/_translation/')){
      if(!env.COMMON)return new Response('Translation service binding missing',{status:503});
      return env.COMMON.fetch(request);
    }
    if(new URL(request.url).pathname.startsWith('/_profiles/')){
      if(!env.PROFILES)return new Response('Profile service binding missing',{status:503});
      return env.PROFILES.fetch(request);
    }
    return env.ASSETS.fetch(request);
  }
};
