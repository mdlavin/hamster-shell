const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const DBus = imports.dbus;
const Lang = imports.lang;
const Mainloop = imports.mainloop;

const Main = imports.ui.main;
const Panel = imports.ui.panel;
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
                inSignature: '',
                outSignature: ''},
                { name: 'AddActivity',
                inSignature: 'ss',
                outSignature: ''},
                { name: 'AddCategory',
                inSignature: 's',
                outSignature: ''},
                { name: 'AddFact',
                inSignature: 'suu',
                outSignature: 'i'}
              ],
    signals: [{name: 'TrackingStopped'},
              {name: 'FactUpdated',
              inSignature: 'i'}]
};

function HamsterClient() {
    this._init();
}

HamsterClient.prototype = {

    _init: function() {
         DBus.session.proxifyObject(this, 'org.gnome.Hamster', '/org/gnome/Hamster');

         this.actor = new St.BoxLayout({vertical: true, style_class: "hamster"});

         let box = new St.BoxLayout({style_class: "hamsterBox"});
         this.actor.add(box);
         this.activity_category = new St.Label({text: "No activity"});
         box.add(this.activity_category);
         this.stop_button = new St.Button({style_class: 'hamsterButton'});
         this.stop_button.set_child(new St.Label({text: "Stop Tracking"}));
         this.stop_button.connect("clicked", Lang.bind(this, function() {
            this.StopTrackingRemote();
         }));
         box.add(this.stop_button);

         let box = new St.BoxLayout({style_class: "hamsterBox"});
         this.actor.add(box);
         this.actor.add(new St.Label({text: "START NEW ACTIVITY"}));

         let box = new St.BoxLayout({style_class: "hamsterBox"});
         this.actor.add(box);
         this.entry = new St.Entry({name: "activityEntry"});
         box.add(this.entry, { expand: true });
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
            print("activity: -"+fact.activity+"-");
            print("category: -"+fact.category+"-");
            print("desc: -"+fact.description+"-");
            print("start time: -"+fact.start_time+"-");
            print("end time: -"+fact.end_time+"-");
        }));
         this.start_button = new St.Button({style_class: 'hamsterButton'});
         this.start_button.set_child(new St.Label({text: "Start Tracking"}));
         this.start_button.connect("clicked", Lang.bind(this, function() {
            let text = this.entry.get_text();
            this.entry.set_text("");
            if (text != '')
                this._parseAndSaveActivityInput(text);
         }));
         box.add(this.start_button);


     },

    _parseActivityInput: function(text) {
        let fact = {activity: "", category: "", description: "",
                    start_time: 0, end_time: 0};

        if (text == '')
            return fact;

        let parseHours = function(hours) {
            let day_date = new Date();
            let result = Date.parse(day_date.toLocaleFormat("%m-%d-%Y, ")+hours);
            if (result.toString() == 'NaN')
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

        let fact = this._parseActivityInput(text);

        if (fact.activity == "")
            return;

        this.AddCategoryRemote(fact.category);
        this.AddActivityRemote(fact.activity, fact.category);
        this.AddFactRemote(fact.activity, fact.start_time, fact.end_time,
                Lang.bind(this, function() {}));
    }

};

DBus.proxifyPrototype(HamsterClient.prototype, HamsterIface);

function TimeTrackerButton() {
    this._init();
}

TimeTrackerButton.prototype = {
    __proto__: Panel.PanelMenuButton.prototype,

    _init: function() {
        Panel.PanelMenuButton.prototype._init.call(this, St.Align.START);
        this.menu.addAction("Summary", Lang.bind(this, this._onSummary));
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addAction("Preferences", Lang.bind(this, this._onPrefs));
        this.menu.addAction("Help", Lang.bind(this, this._onSummary));

        this._text = new St.Label({text: "No activity"});
        this.actor.set_child(this._text);

        this._hamster = new HamsterClient();
        /*this._hamster.connect("FactUpdated", Lang.bind(this, function(fact_id) {
                    this._text.set_text("up:"+fact_id);
                    }));*/
        Mainloop.timeout_add_seconds(1, Lang.bind(this, function() {
            this._hamster.GetCurrentFactRemote(Lang.bind(this, function(fact) {
                if(fact == null || !fact.name) {
                    this._text.set_text("No activity");
                }
                else {
                    let minutes = Math.floor(fact.delta / 60);
                    let hours = Math.floor(minutes / 60);
                    minutes -= hours * 60;

                    let time = " %d:%d".format(hours, minutes);

                    let name = fact.name;
                    if (fact.name.length > 15) {
                        name = fact.name.substr(0, 14) + "..."
                    }
                    this._text.set_text(name + time);
                }
            }));
            return true;
        }));

        this._timeTrackerPopup = null;
    },

    _onButtonPress: function(actor, event) {
        let button = event.get_button();
        if (button == 3 &&
            (!this._timeTrackerPopup || !this._timeTrackerPopup.isOpen))
            this.menu.toggle();
        else
            this._togglePopup();
    },

    _onSummary: function() {

    },

    _onPrefs: function() {

    },

    _togglePopup: function() {
        if (this._timeTrackerPopup == null) {
            this._timeTrackerPopup = new TimeTrackerPopup(this);
            this._timeTrackerPopup.actor.hide();
        }

        if (this.menu.isOpen && !this._timeTrackerPopup.isOpen) {
            this.menu.close();
            return;
        }

        if (!this._timeTrackerPopup.isOpen)
            this.openPopup();
        else
            this.closePopup();
    },

    closePopup: function() {
        if (!this._timeTrackerPopup || !this._timeTrackerPopup.isOpen)
            return;

        this._timeTrackerPopup.hide();

        this.menu.isOpen = false;
        this.actor.remove_style_pseudo_class('pressed');
    },

    openPopup: function() {
        this._timeTrackerPopup.show();

        // simulate an open menu, so it won't appear beneath the calendar
        this.menu.isOpen = true;
        this.actor.add_style_pseudo_class('pressed');
    }
};

function TimeTrackerPopup(button) {
    this._init(button);
}

TimeTrackerPopup.prototype = {
    _init: function(button) {
        let panelActor = Main.panel.actor;

        this.actor = new St.Bin({ name: 'TimeTrackerPopup' });

        this._button = button
        this._hamster = button._hamster
        this.actor.set_child(this._hamster.actor);

        this.isOpen = false;

        Main.chrome.addActor(this.actor, { visibleInOverview: true,
                                           affectsStruts: false });
        Main.chrome.trackActor(this._hamster.entry, { visibleInOverview: true,
                                           affectsStruts: false });
        this.actor.y = (panelActor.y + panelActor.height - this.actor.height);
        this._hamster.actor.connect('notify::width', Lang.bind(this, this._centerPopup));
    },

    show: function() {
        let panelActor = Main.panel.actor;

        if (this.isOpen)
            return;
        this.isOpen = true;

        this._centerPopup();
        this.actor.lower(panelActor);
        this.actor.show();
        global.stage.set_key_focus(this._hamster.entry.clutter_text);
        Tweener.addTween(this.actor,
                         { y: panelActor.y + panelActor.height,
                           time: 0.2,
                           transition: 'easeOutQuad'
                         });
    },

    hide: function() {
        let panelActor = Main.panel.actor;

        if (!this.isOpen)
            return;
        this.isOpen = false;

        Tweener.addTween(this.actor,
                         { y: panelActor.y + panelActor.height - this.actor.height,
                           time: 0.2,
                           transition: 'easeOutQuad',
                           onComplete: function() { this.actor.hide(); },
                           onCompleteScope: this
                         });
    },

    _centerPopup: function() {
        let panelActor = Main.panel.actor;
        this._hamster.actor.set_width(MIN_WIDTH);

        let primary = global.get_primary_monitor();
        let [sourceX, sourceY] = this._button.actor.get_transformed_position();
        let [sourceWidth, sourceHeight] = this._button.actor.get_transformed_size();

        let x = sourceX;
        if (x + this.actor.width > primary.width)
            x = primary.width - this.actor.width;

        this.actor.x = Math.round(x);
    }
};


/*    <method name="AddActivity">
      <arg direction="in"  type="s" name="activity" />
      <arg direction="in"  type="s" name="category" />
    </method>
    <method name="GetFacts">
      <arg direction="in"  type="u" name="start_date" />
      <arg direction="in"  type="u" name="end_date" />
      <arg direction="out" type="aa{sv}" />
    </method>
    <method name="GetActivities">
      <arg direction="out" type="a(ss)" />
    </method>
    <method name="AddCategory">
      <arg direction="in"  type="s" name="category" />
    </method>
    <method name="AddFact">
      <arg direction="in"  type="s" name="activity" />
      <arg direction="in"  type="u" name="start_time" />
      <arg direction="in"  type="u" name="end_time" />
      <arg direction="out" type="i" />
    </method>
    <method name="RemoveActivity">
      <arg direction="in"  type="s" name="activity_name" />
      <arg direction="in"  type="s" name="category" />
    </method>
    <method name="GetCurrentActivity">
      <arg direction="out" type="s" />
      <arg direction="out" type="s" />
    </method>
    <method name="RemoveCategory">
      <arg direction="in"  type="s" name="category" />
    </method>*/
