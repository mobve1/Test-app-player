export namespace main {
	
	export class HardwareSpecs {
	    cpuCores: number;
	    ramGB: number;
	    executionProvider: string;
	    gpuName: string;
	    vramGB: number;
	
	    static createFrom(source: any = {}) {
	        return new HardwareSpecs(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cpuCores = source["cpuCores"];
	        this.ramGB = source["ramGB"];
	        this.executionProvider = source["executionProvider"];
	        this.gpuName = source["gpuName"];
	        this.vramGB = source["vramGB"];
	    }
	}
	export class ModelInfo {
	    name: string;
	    path: string;
	    family: string;
	    inputShape: number[];
	    outputShape: number[];
	    compatibility: string;
	    recommendation: string;
	    estimatedMemoryGB: number;
	
	    static createFrom(source: any = {}) {
	        return new ModelInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.family = source["family"];
	        this.inputShape = source["inputShape"];
	        this.outputShape = source["outputShape"];
	        this.compatibility = source["compatibility"];
	        this.recommendation = source["recommendation"];
	        this.estimatedMemoryGB = source["estimatedMemoryGB"];
	    }
	}

}

