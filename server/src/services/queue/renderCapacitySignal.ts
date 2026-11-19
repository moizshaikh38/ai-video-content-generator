/** Process-local wake signal only. Durable Mongo jobs and leases own work. */
const listeners=new Set<()=>void>();
export function onRenderCapacityAvailable(listener:()=>void){listeners.add(listener);return()=>listeners.delete(listener);}
export function notifyRenderCapacityAvailable(){for(const listener of listeners){try{listener();}catch{/* A notification cannot strand/reclassify a completed lease. Periodic recovery remains. */}}}
