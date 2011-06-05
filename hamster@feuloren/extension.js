const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const DBus = imports.dbus;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Util = imports.misc.util

const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Tweener = imports.ui.tweener;

const MIN_WIDTH = 450;

function main()
{
    let button = new TimeTrackerButton();
    Main.panel._centerBox.add(button.actor, { y_fill: true });

    Main.panel._menus.addMenu(button.menu);
}

const HamsterIface = {
    name: 'org.gnome.Hamster',
    methods: [{ name: 'GetTags',
                inSignature: '',
                outSignature: 'as' },
              { name: 'GetFactById',
                inSignature: 'i',
                outSignature: 'a{sv}' },
              { name: 'GetCurrentFact',
                inSignature: '',
                outSignature: 'a{sv}' },
              { name: 'StopTracking',
                inSignature: 'i',
                outSignature: ''},
              { name: 'AddActivity',
                inSignature: 'si',
                outSignature: 'i'},
              { name: 'GetCategoryId',
		inSignature: 's',
		outSignature: 'i'},
              { name: 'AddCategory',
                inSignature: 's',
                outSignature: 'i'},
              { name: 'AddFact',
                inSignature: 'ssii',
                outSignature: 'i'},
	      { name: 'GetTodaysFacts',
		inSignature: '',
		outSignature: 'a(iiissisasii)'},
	      { name: 'UpdateFact',
		inSignature: 'issii',
		outSignature: 'i'}
             ],
     signals: [{name: 'TrackingStopped'},
	       {name: 'FactsChanged'}
	      ]
};

function HamsterClient() {
    this._init();
}

HamsterClient.prototype = {

    _init: function() {
         DBus.session.proxifyObject(this, 'org.gnome.Hamster', '/org/gnome/Hamster');

         this.actor = new St.BoxLayout({vertical: true});

         let box = new St.BoxLayout({style_class: "hamsterBox"});
         this.actor.add(box);
         this.activity_category = new St.Label({text: "No activity"});
         box.add(this.activity_category);
         this.stop_button = new St.Button({style_class: 'hamsterButton'});
         this.stop_button.set_child(new St.Label({text: "Stop Tracking"}));
         this.stop_button.connect("clicked", Lang.bind(this, function() {
	     // global.log("About to call StopTrackingRemote");
	     try {
		 this.StopTrackingRemote(0);
	     } catch (err) {
		 global.log("Error calling StopTrackingRemote: " + err);
	     }
         }));
         box.add(this.stop_button);

         let box = new St.BoxLayout({style_class: "hamsterBox"});
         this.actor.add(box);
         this.actor.add(new St.Label({text: "START NEW ACTIVITY"}));

         let box = new St.BoxLayout({style_class: "hamsterBox"});
         this.actor.add(box);
         this.entry = new St.Entry({name: "activityEntry", hint_text: "Enter new activity"});
         //box.add(this.entry, { expand: true });
         this.entry.clutter_text.connect('activate', Lang.bind(this, function (o, e) {
            let text = o.get_text();
            o.set_text("");
            if (text == '')
                return true;
            else
                this._parseAndSaveActivityInput(text);

            return true;
         }));
         this.entry.clutter_text.connect('text-changed', Lang.bind(this, function() {
            let text = this.entry.get_text();
            if (text == '') {
                //this.previewBox.hide();
                return;
            }

            let fact = this._parseActivityInput(text);
            //global.log("activity: -"+fact.activity+"-");
            //global.log("category: -"+fact.category+"-");
            //global.log("desc: -"+fact.description+"-");
            //global.log("start time: -"+fact.start_time+"-");
            //global.log("end time: -"+fact.end_time+"-");
        }));
//         this.start_button = new St.Button({style_class: 'hamsterButton'});
//         this.start_button.set_child(new St.Label({text: "Start Tracking"}));
//         this.start_button.connect("clicked", Lang.bind(this, function() {
//            let text = this.entry.get_text();
//            this.entry.set_text("");
//            if (text != '')
//                this._parseAndSaveActivityInput(text);
//         }));
//         box.add(this.start_button);

     },

    _parseActivityInput: function(text) {
        let fact = {activity: "", category: "", description: "",
                    start_time: null, end_time: null};

        if (text == '')
            return fact;

        let parseHours = function(hours) {
            let day_date = new Date();
            let result = Date.parse(day_date.toLocaleFormat("%m-%d-%Y, ")+hours);
            if (isNan(result))
                return 0;
            else
                return result;
        }

        let input_parts = text.split(" ");
        if (input_parts.length > 1 && /^-?\d/.test(input_parts[0])) { //look for time only if there is more
            var potential_time = text.split(" ")[0];
            print(potential_time);
            var potential_end_time = null;
            if (potential_time.length > 1 && potential_time[0] == "-") {
                //if starts with minus, treat as minus delta minutes
                fact.start_time = Date.now() + potential_time*60000;

            } else {
                if (potential_time.indexOf("-") > 0) {
                    [potential_time, potential_end_time] = potential_time.split("-");
                    var day_date = new Date();
                    fact.end_time = parseHours(potential_end_time);
                }

                fact.start_time = parseHours(potential_time);
            }

            //remove parts that worked
            if (fact.start_time && potential_end_time && !fact.end_time)
                fact.start_time = 0; //scramble
            else if (fact.start_time)
                text = text.substr(text.indexOf(" ")+1);
        }

        let pos = text.indexOf(",");
        if (pos > 0) {
            fact.description = text.substr(pos+1).trim();
            text = text.substr(0, pos);
        }

        let pos = text.indexOf("@");
        if (pos > 0) {
            fact.category = text.substr(pos+1).trim();
            text = text.substr(0, pos);
        }
        fact.activity = text.trim();

        return fact;
    },

    _parseAndSaveActivityInput: function(text) {
	// global.log("About to call AddFactRemote");
	try {
            this.AddFactRemote(text, "", 0,0);	
	    // global.log("Done calling AddFactRemote");
	} catch (err) {
	    global.log("Error calling AddFactRemote: " + err);
	}

    },

};

DBus.proxifyPrototype(HamsterClient.prototype, HamsterIface);

function TimeTrackerButton() {
    this._init();
}

TimeTrackerButton.prototype = {
    __proto__: PanelMenu.Button.prototype,

    _init: function() {
        PanelMenu.Button.prototype._init.call(this, St.Align.START);

        this._hamster = new HamsterClient();

        this.activity_category_item = new PopupMenu.PopupMenuItem("No Activity", {reactive: false});
        this.activityCategory = this.activity_category_item.label;
        this.menu.addMenuItem(this.activity_category_item);
        
        this.stop_item = new PopupMenu.PopupMenuItem("Stop Tracking");
        this.menu.addMenuItem(this.stop_item);
        this.stop_item.connect("activate", Lang.bind(this, this._stopCurrentTask));

        this.stop_separator = new PopupMenu.PopupSeparatorMenuItem()
        this.menu.addMenuItem(this.stop_separator);

        let hamsterItem = new PopupMenu.PopupBaseMenuItem({reactive: false});
        hamsterItem.addActor(this._hamster.entry);
        this.menu.addMenuItem(hamsterItem);

//      this.start_item = new PopupMenu.PopupBaseMenuItem({reactive: false});
//      this.startTrackingLabel = new St.Label({text: "Start Tracking"});
//        this.start_item.addActor(this.startTrackingLabel);
//        this.start_item.connect("activate", Lang.bind(this._hamster, function() {
//            let text = this.entry.get_text();
//            this.entry.set_text("");
//            if (text != '')
//                this._parseAndSaveActivityInput(text);
//         }));
//        this.menu.addMenuItem(this.start_item);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this.menu.addAction("Add older activity", Lang.bind(this, this._onSummary));
        this.menu.addAction("Summary", Lang.bind(this, this._onSummary));
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addAction("Preferences", Lang.bind(this, this._onPrefs));
        this.menu.addAction("Help", Lang.bind(this, this._onSummary));

        this._text = new St.Label({text: "No activity"});
        this.actor.set_child(this._text);

        Mainloop.timeout_add_seconds(1, Lang.bind(this, function() {
	    this._refreshCurrentTask();
            return true;
        }));

	this._hamster.connect('FactsChanged', Lang.bind(this, this._onFactsChanged));
    },

    _updateCurrentFact: function(fact) {
	// global.log('Inside _updateCurrentFact: ' + fact);
        if(fact == null || !fact.name) {
            this._text.set_text("No activity");
            this.activityCategory.set_text("No activity");
//            this.startTrackingLabel.set_text("Start Tracking");
            this.stop_item.actor.visible = false;
            this.activity_category_item.actor.visible = false;
            this.stop_separator.actor.visible = false;
        } else {
	    let minutes = Math.floor(fact.delta / 60);
	    let time = " %d min".format(minutes);
	    if (minutes >= 60) {
		let hours = Math.floor(minutes / 60);
		minutes -= hours * 60;
	    
		time = " %d:%d".format(hours, minutes);
	    }
	    
            let name = fact.name;
            if (fact.name.length > 15) {
                name = fact.name.substr(0, 14) + "..."
            }
            this._text.set_text(name + time);
            
            if (fact.category == '')
                this.activityCategory.set_text(fact.name);
            else
                this.activityCategory.set_text(fact.name+" - "+fact.category);
//            this.startTrackingLabel.set_text("Change");
            this.stop_item.actor.visible = true;
            this.activity_category_item.actor.visible = true;
            this.stop_separator.actor.visible = true;
        }
    },

    _withCurrentFact: function(fun) {
	try {
            this._hamster.GetTodaysFactsRemote(
		Lang.bind(this,
			  function (todaysFacts) {
			      // global.log("GetTodaysFactsRemote returned " + todaysFacts);
			      for(var i=0; i<todaysFacts.length; i++) {
				  var fact = todaysFacts[i];
				  fact.id = fact[0];
				  fact.start = fact[1];
				  fact.end = fact[2];
				  fact.description = fact[3];
				  fact.name = fact[4];
				  fact.category = fact[6];
				  fact.tags = fact[7];
				  fact.delta = fact[9];
				  
				  if (fact[2] == 0) {
				      // Found current task
				      // global.log("Found current fact:" + fact);
				      try {
					  fun(fact);
				      } catch (err) {
					  global.log("Error updating current fact: " + err);
				      }
				      return;
				  }
			      }

			      // No current task was found
			      this._updateCurrentFact(null);
			  }
			 )
	    );	
	} catch (err) {
	    global.log('Failed to call GetTodaysFactsRemote: ' + err);
	}	
    },
    
    _refreshCurrentTask: function() {
	this._withCurrentFact(Lang.bind(this, this._updateCurrentFact));
    },

    _stopCurrentTask: function() {
	this._withCurrentFact(Lang.bind(this, function(fact) {
	    try {
		let timezoneOffset = (new Date().getTimezoneOffset()) * 60;
		let end = Math.floor(Date.now()/1000) - timezoneOffset;
		this._hamster.StopTrackingRemote(end);
	    } catch (err) {
		global.log("Error calling StopTrackingRemote: " + err);
	    }
	}));
    },

    _onFactsChanged: function() {
	// global.log('FactsChanged');
	this._refreshCurrentTask();
    },

    _onButtonPress: function(actor, event) {
        this.menu.toggle();
    },

    _onSummary: function() {
	Util.spawn(['hamster-time-tracker', 'overview']);
    },

    _onPrefs: function() {
	Util.spawn(['hamster-time-tracker', 'preferences']);
    },
};
