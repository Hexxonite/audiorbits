/**
 * @author D.Thiele @https://hexx.one
 *
 * @license
 * Copyright (c) 2020 D.Thiele All rights reserved.  
 * Licensed under the GNU GENERAL PUBLIC LICENSE.
 * See LICENSE file in the project root for full license information.  
 * 
 * @description
 * Contains main rendering context for AudiOrbits
 * 
 * @todo
 * - fix camera parallax stuff
 */

import * as THREE from 'three';

import { ColorHelper } from './ColorHelper';
import { LevelHolder } from './LevelHelper';
import { ShaderHolder } from './ShaderHelper';
import { VRButton } from './VRButton';

import { EffectComposer } from './three/postprocessing/EffectComposer';

import Stats from './we_utils/src/Stats';
import { WEAS } from './we_utils/src/weas/WEAS';
import { WEICUE } from './we_utils/src/WEICUE';
import { Smallog } from './we_utils/src/Smallog';
import { CSettings } from "./we_utils/src/CSettings";
import { CComponent } from './we_utils/src/CComponent';
import { FancyText } from './FancyText';

class ContextSettings extends CSettings {
	// Camera category
	parallax_option: number = 0;
	parallax_angle: number = 180;
	parallax_strength: number = 3;
	auto_parallax_speed: number = 2;
	parallax_cam: boolean = true;
	field_of_view: number = 90;
	custom_fps: boolean = false;
	fps_value: number = 60;
	shader_quality: number = 1;
	cam_centered: boolean = false;

	// offtopic
	fog_thickness: number = 3;
	stats_option: number = -1;

	// mirrored setting
	scaling_factor: number = 1500;
	level_depth: number = 1000;
	num_levels: number = 8000;
}

export class ContextHolder extends CComponent {

	// global state
	public isWebContext = false;
	public PAUSED = false;

	// webvr user input data
	private userData = {
		isSelecting: false,
		controller1: null,
		controller2: null
	};

	public settings: ContextSettings = new ContextSettings();

	// html elements
	private container = null;
	private mainCanvas = null;

	// mouse over canvas
	private mouseX = 0;
	private mouseY = 0;

	// Three.js objects
	private renderer: THREE.WebGLRenderer = null;
	private camera: THREE.PerspectiveCamera = null;
	private scene: THREE.Scene = null;
	private stats: Stats = null;

	private composer: EffectComposer = null;
	private clock: THREE.Clock = new THREE.Clock();

	// custom render timing
	private renderTimeout = null;

	// window half size
	private windowHalfX = window.innerWidth / 2;
	private windowHalfY = window.innerHeight / 2;

	// important objects
	public colorHolder: ColorHelper = new ColorHelper();
	public shaderHolder: ShaderHolder = new ShaderHolder();
	public textHolder: FancyText = null;

	public weas: WEAS = new WEAS();
	public geoHolder: LevelHolder = new LevelHolder(this.weas);
	public weicue: WEICUE = new WEICUE(this.weas);

	// add global listeners
	constructor() {
		super();

		// mouse listener
		var mouseUpdate = (event) => {
			if (this.settings.parallax_option != 1) return;
			if (event.touches && event.touches.length == 1) {
				event.preventDefault();
				this.mouseX = event.touches[0].pageX - this.windowHalfX;
				this.mouseY = event.touches[0].pageY - this.windowHalfY;
			}
			else if (event.clientX) {
				this.mouseX = event.clientX - this.windowHalfX;
				this.mouseY = event.clientY - this.windowHalfY;
			}
		}
		document.addEventListener("touchstart", mouseUpdate, false);
		document.addEventListener("touchmove", mouseUpdate, false);
		document.addEventListener("mousemove", mouseUpdate, false);

		// scaling listener
		window.addEventListener("resize", (event) => {
			this.windowHalfX = window.innerWidth / 2;
			this.windowHalfY = window.innerHeight / 2;
			if (!this.camera || !this.renderer) return;
			this.camera.aspect = window.innerWidth / window.innerHeight;
			this.camera.updateProjectionMatrix();
			this.renderer.setSize(window.innerWidth, window.innerHeight);
		}, false);

		// keep track of children settings
		this.children.push(this.colorHolder);
		this.children.push(this.shaderHolder);
		this.children.push(this.weas);
		this.children.push(this.geoHolder);
		this.children.push(this.weicue);
	}

	// initialize three-js context
	public init(): Promise<void> {
		return new Promise(resolve => {

			// static element
			this.container = document.getElementById("renderContainer");

			// destroy old context
			if (this.renderer) this.renderer.forceContextLoss();
			if (this.composer) this.composer.reset();
			if (this.mainCanvas) {
				this.container.removeChild(this.mainCanvas);
				var cvs = document.createElement("canvas");
				cvs.id = "mainCvs";
				this.container.appendChild(cvs);
			}

			// get canvases & contexts
			// ensure the canvas sizes are set !!!
			// these are independent from the style sizes
			this.mainCanvas = document.getElementById("mainCvs");
			this.mainCanvas.width = window.innerWidth;
			this.mainCanvas.height = window.innerHeight;

			// dont use depth buffer on low quality
			const qual = this.settings.shader_quality < 3 ? (this.settings.shader_quality < 2 ? "low" : "medium") : "high";
			const dBuffer = this.settings.shader_quality > 1;
			const shaderP = qual + "p";


			// create camera
			const viewDist = this.settings.num_levels * this.settings.level_depth * (this.settings.cam_centered ? 0.5 : 1);
			this.camera = new THREE.PerspectiveCamera(this.settings.field_of_view, window.innerWidth / window.innerHeight, 3, viewDist * 1.2);
			// create scene
			this.scene = new THREE.Scene();
			// create distance fog
			this.scene.fog = new THREE.FogExp2(0x000000, this.settings.fog_thickness / viewDist / 2);
			// create render-context
			this.renderer = new THREE.WebGLRenderer({
				alpha: true,
				antialias: false,
				canvas: this.mainCanvas,
				logarithmicDepthBuffer: dBuffer,
				powerPreference: this.getPowerPreference(),
				precision: shaderP,
			});
			this.renderer.setClearColor(0x000000, 0);
			this.renderer.setSize(window.innerWidth, window.innerHeight);
			// initialize VR mode
			if (this.isWebContext) this.initWebXR();

			// initialize shader composer
			this.composer = new EffectComposer(this.renderer, shaderP);
			// initialize shaders
			this.shaderHolder.pipeline(this.scene, this.camera, this.composer);

			// initialize statistics
			if (this.settings.stats_option >= 0) {
				Smallog.Debug("Init stats: " + this.settings.stats_option);
				this.stats = Stats();
				this.stats.showPanel(this.settings.stats_option); // 0: fps, 1: ms, 2: mb, 3+: custom
				document.body.appendChild(this.stats.dom);
			}

			// initialize fancy text
			this.textHolder = new FancyText(this.scene, this.camera.position.multiplyScalar(0.7), document.title);

			// initialize main geometry
			this.geoHolder.init(this.scene, this.camera, resolve);
		});
	}

	// clamp camera position
	private clampCam(axis) {
		return Math.min(this.settings.scaling_factor / 2, Math.max(-this.settings.scaling_factor / 2, axis));
	}

	// update shader values
	private update(ellapsed, deltaTime) {
		// calculate camera positioning
		const newCamX = this.clampCam(this.mouseX * this.settings.parallax_strength / 50);
		const newCamY = this.clampCam(this.mouseY * this.settings.parallax_strength / -50);
		if (this.camera.position.x != newCamX)
			this.camera.position.x += (newCamX - this.camera.position.x) * deltaTime * 0.05;
		if (this.camera.position.y != newCamY)
			this.camera.position.y += (newCamY - this.camera.position.y) * deltaTime * 0.05;

		// calculate camera look-at-point (parallax)
		const lookOrigin = this.settings.parallax_cam ? this.scene.position : this.camera.position;
		const lookAt = lookOrigin.sub(new THREE.Vector3(0, 0, this.settings.level_depth * 2));
		this.camera.lookAt(lookAt);

		// TODO: WEBVR PROCESSING
		if (this.isWebContext) {
			this.handleVRController(this.userData.controller1);
			this.handleVRController(this.userData.controller1);
		}
	}

	// called after any setting changed
	public updateSettings() {
		// fix for centered camera on Parallax "none"
		if (this.settings.parallax_option == 0) this.mouseX = this.mouseY = 0;
		// set Cursor for "fixed" parallax mode
		if (this.settings.parallax_option == 3) this.positionMouseAngle(this.settings.parallax_angle);

		// update preview visbility after setting possibly changed
		this.weicue.updatePreview();

		// apply eventually updated settings to WASM Module
		this.weas.updateSettings();
	}


	///////////////////////////////////////////////
	// RENDERING
	///////////////////////////////////////////////

	// start or stop rendering
	public setRenderer(render: boolean) {
		Smallog.Debug("setRenderer: " + render);

		// clear all old renderers
		if (this.renderer) {
			this.renderer.setAnimationLoop(null);
		}
		if (this.renderTimeout) {
			clearTimeout(this.renderTimeout);
			this.renderTimeout = null;
		}
		// call new renderer ?
		if (render) {
			// set state to running
			this.PAUSED = this.weicue.PAUSED = false;
			// initialize rendering
			if (this.settings.custom_fps) {
				this.renderTimeout = setTimeout(() => this.renderLoop(), 1000 / this.settings.fps_value);
			}
			else if (this.renderer) {
				this.renderer.setAnimationLoop(() => this.renderLoop());
			}
			else Smallog.Error("not initialized!");
			// show again
			$("#mainCvs").addClass("show");
		}
		else {
			this.PAUSED = this.weicue.PAUSED = true;
			$("#mainCvs").removeClass("show");
		}
	}

	// root render frame call
	private renderLoop() {
		// paused - stop render
		if (this.PAUSED) return;

		// custom rendering needs manual re-call
		if (this.renderTimeout)
			this.renderTimeout = setTimeout(() => this.renderLoop(), 1000 / this.settings.fps_value);

		// track FPS, mem etc.
		if (this.stats)
			this.stats.begin();
		// Figure out how much time passed since the last animation and calc delta
		// Minimum we should reach is 1 FPS
		var ellapsed = Math.min(1, Math.max(0.001, this.clock.getDelta()));
		var delta = ellapsed * 60;

		// render before updating
		this.composer.render();

		// update objects
		this.colorHolder.update(ellapsed, delta);
		this.geoHolder.update(ellapsed, delta);
		this.update(ellapsed, delta);

		// ICUE PROCESSING
		this.weicue.updateCanvas(this.mainCanvas);

		// end stats
		if (this.stats)
			this.stats.end();
	}


	///////////////////////////////////////////////
	// WEB-VR INTEGRATION
	///////////////////////////////////////////////

	// will initialize webvr components and rendering
	private initWebXR() {
		this.renderer.xr.enabled = true;
		document.body.appendChild(new VRButton().createButton(this.renderer));

		this.userData.controller1 = this.renderer.xr.getController(0);
		this.userData.controller1.addEventListener("selectstart", this.onVRSelectStart);
		this.userData.controller1.addEventListener("selectend", this.onVRSelectEnd);
		this.scene.add(this.userData.controller1);

		this.userData.controller2 = this.renderer.xr.getController(1);
		this.userData.controller2.addEventListener("selectstart", this.onVRSelectStart);
		this.userData.controller2.addEventListener("selectend", this.onVRSelectEnd);
		this.scene.add(this.userData.controller2);
	}

	// controller starts selecting
	private onVRSelectStart() {
		this.userData.isSelecting = true;
	}

	// controller stops selecting
	private onVRSelectEnd() {
		this.userData.isSelecting = false;
	}

	// use VR controller like mouse & parallax
	private handleVRController(controller) {
		/** @TODO
		controller.userData.isSelecting
		controller.position
		controller.quaternion
		*/
	}


	///////////////////////////////////////////////
	// HELPER
	///////////////////////////////////////////////

	// use overall "quality" setting to determine three.js "power" mode
	private getPowerPreference() {
		switch (this.settings.shader_quality) {
			case 1: return "low-power";
			case 3: return "high-performance";
			default: return "default";
		}
	}

	// position Mouse with angle
	public positionMouseAngle(degrees) {
		var ang = degrees * Math.PI / 180;
		var w = window.innerHeight;
		if (window.innerWidth < w) w = window.innerWidth;
		w /= 2;
		this.mouseX = w * Math.sin(ang);
		this.mouseY = w * Math.cos(ang);
	}
}