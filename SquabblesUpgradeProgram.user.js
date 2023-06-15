// ==UserScript==
// @name         Squabbles Upgrade Program (S.U.P.)
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Userscript that aims to enhance the user experience on Squabbles.io, by providing additional functionality and settings.
// @author       github.com/smile-eh/SquabblesUpgradeProgram
// @match        *://*.squabbles.io/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=squabbles.io
// @grant        GM.setValue
// @grant        GM.getValue
// @grant        GM.addValueChangeListener
// ==/UserScript==

/****************************
      GLOBAL VARIABLES
****************************/

const apiCache = new Map();

/****************************
          CLASSES
  (Which are basically just objects?
  Who designed this language?)
****************************/

class Helpers{
    /*
    Class to define helper functions
    */
    static observeDOM = (fn, e = document.documentElement, config = { attributes: 1, childList: 1, subtree: 1 }) => {
        /*
        https://old.reddit.com/r/GreaseMonkey/comments/undlw2/need_to_monitor_changes_to_a_specific_element_on/i89bftz/
        Purpose: Monitor changes to a specific element on a live site without refreshing
        */
        const observer = new MutationObserver(fn);
        observer.observe(e, config);
        return () => observer.disconnect();
    };

    static rafAsync() {
        /*
        https://stackoverflow.com/a/47776379
        Purpose: Make function wait until element exists
        used by this.checkElement
        */
        return new Promise(resolve => {
            requestAnimationFrame(resolve); //faster than set time out
        });
    }

    static async checkElement(selector) {
        /*
        https://stackoverflow.com/a/47776379
        Purpose: Make function wait until element exists
        uses this.rafAsync
        */
        let querySelector = null;
        while (querySelector === null) {
            await this.rafAsync();
            querySelector = document.querySelector(selector);
        }
        return querySelector;
    }

    static htmlToElement(html) {
        /**
        Creating a new DOM element from an HTML string
        * @param {String} HTML representing a single element
        * @return {Element}
        * https://stackoverflow.com/a/35385518
        */
        var template = document.createElement('template');
        html = html.trim(); // Never return a text node of whitespace as the result
        template.innerHTML = html;
        return template.content.firstChild;
    }

    static htmlToElements(html) {
        /**
        Creating multiple new DOM elements from an HTML string
        * @param {String} HTML representing any number of sibling elements
        * @return {NodeList}
        * https://stackoverflow.com/a/35385518
        */
        var template = document.createElement('template');
        template.innerHTML = html;
        return template.content;
    }
}

class Settings{
    /*
    Class to hold the settings that currently exist in the GM.state (GM.setState/GM.getState)
    Interaction with the state should only be done through this class.
    If you are calling GM.setState/getState/addValueChangeListener in another location,
    consider moving it here.
    */
    constructor(){
        this.compact = false;
        this.reverse = false;
        this.topScroll = false;
        this.preview = false;
        this.normalizeButtons = false;
    }
    async loadValues(){
        /*
        Load the values that currently exist in the state, and set them accordingly
        */
        this.compact = await GM.getValue("compact", false);
        this.reverse = await GM.getValue("reverse", false);
        this.topScroll = await GM.getValue("topScroll", false);
        this.preview = await GM.getValue("preview", false);
        this.normalizeButtons = await GM.getValue("normalizeButtons", false);
    }
    toggleCompact(){
        this.compact = !this.compact;
        GM.setValue("compact", this.compact);
    }
    toggleReverse(){
        this.reverse = !this.reverse;
        GM.setValue("reverse", this.reverse);
    }
    toggleTopScroll(){
        this.topScroll = !this.topScroll;
        GM.setValue("topScroll", this.topScroll);
    }
    togglePreview(){
        this.preview = !this.preview;
        GM.setValue("preview", this.preview);
    }
    toggleNormalizeButtons(){
        this.normalizeButtons = !this.normalizeButtons;
        GM.setValue("normalizeButtons", this.normalizeButtons);
    }
    settingIdToToggle(settingName){
        /**
        Match an ID of a setting to a function to call when it is toggled
        * @param {String} ID representing the setting
        */
        switch(settingName){
            case "compact": return this.toggleCompact();
            case "reverse": return this.toggleReverse();
            case "topScroll": return this.toggleTopScroll();
            case "preview": return this.togglePreview();
            case "normalizeButtons": return this.toggleNormalizeButtons();
        }
    }
    startSettingUpdateListeners(pageModifier){
        GM.addValueChangeListener("compact", () => pageModifier.compactMode(this.compact));
        GM.addValueChangeListener("reverse", () => pageModifier.reverseMode(this.reverse));
        GM.addValueChangeListener("topScroll", () => pageModifier.topScrollMode(this.topScroll));
        GM.addValueChangeListener("preview", () => pageModifier.previewMode(this.preview));
        GM.addValueChangeListener("normalizeButtons", () => pageModifier.normalizeButtonsMode(this.normalizeButtons));
    }
    setupInitialElements(pageModifier){
        PageModifier.setupReverseMode();
        PageModifier.setupPreviewMode();
    }
}


class NavModifier{
    /*
    Class to modify the existing NavBar.

    If you are modifying the NavBar in another location, consider moving it here.
    */
    addNavSettings(settingMgr){
        /*
        Add the settings button to the navigation bar.
        Does not add an action events, only deals with the DOM manipulations
        to make the UI appear how we want it.
        */
        const settingsDropDownHtml =[ // String representing the HTML for the items in our drop down list. Whitespace matters. Think *dangerouslySetInnerHTML* from React.
            `<li class="dropdown-item setting-toggle" id="compact"><i class="fa-solid ${settingMgr.compact ? "fa-toggle-on" : "fa-toggle-off"} px-1"></i>Compact</li>`,
            `<li class="dropdown-item setting-toggle" id="reverse"><i class="fa-solid ${settingMgr.reverse ? "fa-toggle-on" : "fa-toggle-off"} px-1"></i>Reverse</li>`,
            `<li class="dropdown-item setting-toggle" id="preview"><i class="fa-solid ${settingMgr.preview ? "fa-toggle-on" : "fa-toggle-off"} px-1"></i>Preview</li>`,
            `<li class="dropdown-item setting-toggle" id="topScroll"><i class="fa-solid ${settingMgr.topScroll ? "fa-toggle-on" : "fa-toggle-off"} px-1"></i>Scroll</li>`,
            `<li class="dropdown-item setting-toggle" id="normalizeButtons"><i class="fa-solid ${settingMgr.normalizeButtons ? "fa-toggle-on" : "fa-toggle-off"} px-1"></i>Normalize</li>`
        ];

        // Wait until the navbar exists, then add a button
        Helpers.checkElement('.navbar')
            .then((element) => {
            //Select the end components of the navbard
            let navBarEnd = document.querySelector("nav.navbar div.text-end div.d-flex");

            //Get the hamburgerMenu, and clone it to reuse it's properties
            let hamClone = navBarEnd.querySelector("div.dropdown.d-lg-none").cloneNode(true);
            hamClone.classList.remove("d-lg-none")
            //update the icon
            hamClone.querySelector("i.fa-bars").classList.add("fa-cog");
            hamClone.querySelector("i.fa-bars").classList.remove("fa-bars");

            //get the drop down list from the hamburger menu
            let dropdown = hamClone.querySelector("ul")
            dropdown.classList.add("setting-toggle-list");
            dropdown.innerHTML = ""; //remove all items
            dropdown.style.cursor = "pointer";

            // Generate the items we have to add to the drop down using our helpers
            for( let li of settingsDropDownHtml){
                dropdown.appendChild(Helpers.htmlToElement(li));
            }

            navBarEnd.querySelector("div:not([class])").before(hamClone);
        });
    }
    addNavActions(settingMgr){
        /*
        Add the actions for our nav bar settings.
        This expects that the DOM manipulations have been completed.
        and that the only remaining step is to add the event handlers.
        */

        // Wait until the settings componenets exists, then add event handlers
        Helpers.checkElement('.setting-toggle-list')
            .then((element) => {
            const toggleButtons = document.querySelectorAll(".setting-toggle");
            for(let button of toggleButtons){
                button.addEventListener("click", () => {
                    /// I Know that some people don't like eval, but I define these strings I know what to expect
                    /// I could also write a switch / case to make this foolproof but I am lazy
                    /// Switch based on the setting.id and call the corresponding settingMgr.togglerXYZ()
                    /// Scratch that, I did it lol
                    settingMgr.settingIdToToggle(button.id);
                });
                GM.addValueChangeListener(button.id, (key, oldValue, newValue, remote) => {
                    // Get the icon for the toggle switch
                    let icon = button.querySelector("i");
                    // Remove ALL possible classes
                    icon.classList.remove("fa-toggle-on");
                    icon.classList.remove("fa-toggle-off");
                    // Add the new correct class
                    icon.classList.add(newValue ? "fa-toggle-on" : "fa-toggle-off");
                });
            }
        });
    }
}

class PageModifier{
    /*
    Class to modify the page's UI.

    Examples include modifying the post lookout, adding scroll button, or
    adding the preview pane for communities.

    If you are modifying the page in another location, consider moving it here.
    */

    compactMode(enabled){
        Helpers.checkElement(".comment")
            .then((element) => {
            if(enabled){
                const comments = document.querySelectorAll(".comment:not(.compact_loaded)");
                for(let c of comments){
                    c.classList.add("compact_loaded");
                    c.querySelector(".comment-collapse-button").click();
                }
            }
            else {
                const comments = document.querySelectorAll(".comment");
                for(let c of comments){
                    const anchors = c.querySelectorAll("a");
                    for(let a of anchors){
                        if(a.innerHTML == "Expand") a.click();
                    }
                }
            }
        });
    }
    reverseMode(enabled){
        PageModifier.setupReverseMode();
        if(enabled){
            Helpers.checkElement(".swap_post_loaded")
                .then((element) => {
                let posts = document.querySelectorAll(".swap_post_loaded:not(.swapped)");
                for(let p of posts){
                    p.classList.add("swapped");
                    p.classList.remove("normal");
                    let pc=p.children[0];
                    pc.children[1].after(pc.children[0]);
                }
            });
        }
        else {
            Helpers.checkElement(".swap_post_loaded")
                .then((element) => {
                let posts = document.querySelectorAll(".swap_post_loaded:not(.normal)");
                for(let p of posts){
                    p.classList.add("normal");
                    p.classList.remove("swapped");
                    let pc=p.children[0];
                    pc.children[1].after(pc.children[0]);
                }
            });
        }
    }
    topScrollMode(enabled){
        
        const btnScrollTopSize = '3rem';
        const btnScrollTopId = 'btnScrollTop';

        if(enabled) {

            // Do nothing if the button already exists
            if (document.getElementById(btnScrollTopId)) return;

            let app = document.getElementById('app');

            // Create the button...
            const btnScrollTop = document.createElement('button');
            btnScrollTop.id = btnScrollTopId;
            const btnClasses = ['btn', 'btn-lg', 'rounded-circle', 'btn-secondary',
                                'position-fixed', 'bottom-0', 'end-0', 'm-3'];
            btnScrollTop.classList.add(...btnClasses);

            // ...and add its icon
            let buttonIcon = document.createElement('i');
            const iconClasses = ['fa-solid', 'fa-up'];
            buttonIcon.classList.add(...iconClasses);
            btnScrollTop.appendChild(buttonIcon);

            // Add it to the DOM
            document.body.appendChild(btnScrollTop);
            const eBtnScrollTop = document.getElementById(btnScrollTopId);

            // Style the button *after* it's been messed with by the DOM
            eBtnScrollTop.style.display = 'flex';
            eBtnScrollTop.style.width = btnScrollTopSize;
            eBtnScrollTop.style.height = btnScrollTopSize;
            eBtnScrollTop.style.padding = '0';
            eBtnScrollTop.style.transition = 'opacity 125ms linear';
            eBtnScrollTop.style.opacity = (app.scrollTop > 20) ? '1' : '0';
            const eBtnScrollTopIcon = eBtnScrollTop.querySelector('i');
            eBtnScrollTopIcon.style.margin = 'auto';

            // Add its events
            eBtnScrollTop.addEventListener('click', () => {
                app.scrollTo({top: 0, left: 0, behavior: 'smooth'});
            });

            // Show the button after the page is scrolled down a little
            app.onscroll = () => {
                if (app.scrollTop > 20) {
                    eBtnScrollTop.style.opacity = '1';
                }
                else {
                    eBtnScrollTop.style.opacity = '0';
                }
            }

            console.log("topScroll Mode Enabled - Add a scroll to top button");
        }
        else {
            document.getElementById(btnScrollTopId).remove();

            console.log("topScroll Mode Disabled -  Remove the scroll to top button");
        }
    }
    previewMode(enabled){
        PageModifier.setupPreviewMode();
        if(enabled){
            console.log("enabled");
            //Select them all then add a mouseover event
            let postContent = document.querySelectorAll(".post_header");
            for(let p of postContent){
                let anchor = p.nextSibling.querySelector("a")
                if(anchor) anchor.onmouseover=PreviewActions.handleMouseOver.bind(this, anchor);
            }
        }
        else {
            //Select them all then add a mouseover event
            let postContent = document.querySelectorAll(".post_header");
            for(let p of postContent){
                let anchor = p.nextSibling.querySelector("a")
                if(anchor) anchor.onmouseover=null;
            }
        }
    }

    normalizeButtonsMode(enabled){
        // Setup for being able to change the size and shape of the buttons later
        const buttonClass = 'round-button'
        const buttonSize = '2.5em';

        if(enabled){
            PageModifier.setupNormalizeButtonsMode(buttonClass);

            let buttons = document.querySelectorAll(`.${buttonClass}`);
            for (let button of buttons) {
                if (!(button.classList.contains('normalized'))) {
                    button.classList.add('normalized');
                    button.style.display = 'flex';
                    button.style.width = buttonSize;
                    button.style.height = buttonSize;
                    button.style.padding = '0';
                    let buttonIcon = button.querySelector('i');
                    if (buttonIcon) { buttonIcon.style.margin = 'auto'; }
                }
            }
        }
        else {
            let buttons = document.querySelectorAll(`.${buttonClass}`);
            for (let button of buttons) {
                button.classList.remove('normalized');
                button.style.display = null;
                button.style.width = null;
                button.style.height = null;
                button.style.padding = null;
                let buttonIcon = button.querySelector('i');
                if (buttonIcon) { buttonIcon.style.margin = null; }
            }
        }
    }

    static setupReverseMode(){
        // Whether or not it is enabled
        // Add a class to the divs, they do not have one
        Helpers.observeDOM(() => {
            // Add a class to the divs, they do not have one
            Helpers.checkElement("#content-wrapper .page .container")
                .then((element) => {
                const container = document.querySelectorAll("#content-wrapper .page .container");
                let posts = container[0].querySelectorAll(":scope > div:not([class]):not(.swap_post_loaded)");
                for(let p of posts){
                    p.classList.add("swap_post_loaded");
                }
            });

        });
    }

    static setupPreviewMode(){
        // Add a class to the divs, they do not have one
        Helpers.checkElement("div.card-header")
            .then((element) => {
            const posts = document.querySelectorAll("div.card-header:not(.post_header)");
            for(let p of posts){
                p.classList.add("post_header");
            }
        }); //Easier to work with now
    }

    static setupNormalizeButtonsMode(buttonClass){
        // Add a class to the buttons we want to normalize

        // Navigation bar buttons
        const navbarButtonsSelector = '.navbar .container > div:last-of-type .rounded-circle';
        PageModifier.addButtonClass(navbarButtonsSelector, buttonClass);
    }

    static addButtonClass = (selector, buttonClass, buttonSize) => {
        Helpers.checkElement(selector)
            .then((element) => {
            const buttons = document.querySelectorAll(selector);
            for (let button of buttons) {
                if (!(button.classList.contains(buttonClass))) {
                    button.classList.add(buttonClass);
                }
            }
        });
    };
}


/****************************
      CONSTANT OBJECTS
****************************/

const API = {
    /*
    Class to communicate with the Squabble API.

    If you are modifying the sending API requests in another location, consider moving it here.
    */
    requestCommunityInfo: async (communityPath) => {
        //Check if the API json has been stored in the cache for this community
        if(apiCache.has(communityPath)) return apiCache.get(communityPath);

        //Api route
        const rootUri = "https://squabbles.io/api"
        const request = new Request(rootUri + communityPath, {
            method:"GET"
        });
        //Get the info from the api
        const res = await fetch(request);

        const json = await res.json()

        // Save the response json to the cache
        apiCache.set(communityPath, json);
        return json;
    }
}

const PreviewActions = {
    makePreviewDiv: (values, parent) => {
        // Before we make a new preview pane
        // To be safe, remove any old ones
        for(let e of document.getElementsByClassName("communityPreviewPane")) e.remove();

        //String representing the html for the preview panel
        const previewPanel = `<div style="background: white;" class="card shadow-sm px-3 py-2 communityPreviewPane"><div><strong>${values.name}</strong><div>${values.description}</div></div></div>`;


        return Helpers.htmlToElement(previewPanel);
    },

    //Callback function for the mouse over event
    handleMouseOver: async (e, api) => {
        //Get the info from the community
        const returnValues = await API.requestCommunityInfo(e.pathname)
        .then((vals) =>{
            const previewDiv = PreviewActions.makePreviewDiv(vals, e);
            //When the user's mouse leaves the anchor tag, delete the preview
            e.onmouseleave= () => {
                previewDiv.remove();
            };
            e.parentNode.appendChild(previewDiv);
        });
    }
}

/****************************
          FUNCTIONS
****************************/

async function main(){
    const settingsManager = new Settings();
    //Load any values that are in the GM.values
    await settingsManager.loadValues();

    const navModifier = new NavModifier();
    //Add the UI elements to the navigation bar
    navModifier.addNavSettings(settingsManager);
    //Add the actions to the Nav elements
    navModifier.addNavActions(settingsManager);

    const pageModifier = new PageModifier();

    // If a UI element add its own class for identification, set it up
    settingsManager.setupInitialElements(pageModifier);

    // Start listening for setting Updates
    settingsManager.startSettingUpdateListeners(pageModifier);

    // Watch the DOM for new posts to load
    Helpers.observeDOM(() => {
        if(settingsManager.compact) pageModifier.compactMode(settingsManager.compact);
        if(settingsManager.preview) pageModifier.previewMode(settingsManager.preview);
        if(settingsManager.reverse) pageModifier.reverseMode(settingsManager.reverse);
        if(settingsManager.topScroll) pageModifier.topScrollMode(settingsManager.topScroll);
        if(settingsManager.normalizeButtons) pageModifier.normalizeButtonsMode(settingsManager.normalizeButtons);
    });
}


// Thank you for reading this script!
// We start in main
main();