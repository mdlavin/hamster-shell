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

         this.actor = new St.BoxLayout({vertical: true});

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
         this.entry = new St.Entry({name: "activityEntry", hint_text: "Activity"});
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

        this._hamster = new HamsterClient();
        //let hamsterItem = new PopupMenu.PopupBaseMenuItem(true);
        //this._hamster.actor.set_width(MIN_WIDTH);
        //hamsterItem.actor.set_child(this._hamster.actor);
        //this.menu.addMenuItem(hamsterItem);
        this.activity_category_item = new PopupMenu.PopupBaseMenuItem(false);
        this.activityCategory = new St.Label({text: "No Activity"});
        this.activity_category_item.actor.set_child(this.activityCategory);
        this.menu.addMenuItem(this.activity_category_item);
        
        this.stop_item = new PopupMenu.PopupMenuItem("Stop Tracking");
        this.menu.addMenuItem(this.stop_item);
        this.stop_item.connect("activate", Lang.bind(this, function() {
            this._hamster.StopTrackingRemote();
        }));

        this.stop_separator = new PopupMenu.PopupSeparatorMenuItem()
        this.menu.addMenuItem(this.stop_separator);

        let hamsterItem = new PopupMenu.PopupBaseMenuItem(false);
        hamsterItem.actor.set_child(this._hamster.entry);
        this.menu.addMenuItem(hamsterItem);

        this.start_item = new PopupMenu.PopupBaseMenuItem(false);
        this.startTrackingLabel = new St.Label({text: "Start Tracking"});
        this.start_item.actor.set_child(this.startTrackingLabel);
        this.start_item.connect("activate", Lang.bind(this._hamster, function() {
            let text = this.entry.get_text();
            this.entry.set_text("");
            if (text != '')
                this._parseAndSaveActivityInput(text);
         }));
        this.menu.addMenuItem(this.start_item);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this.menu.addAction("Add older activity", Lang.bind(this, this._onSummary));
        this.menu.addAction("Summary", Lang.bind(this, this._onSummary));
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addAction("Preferences", Lang.bind(this, this._onPrefs));
        this.menu.addAction("Help", Lang.bind(this, this._onSummary));

        this._text = new St.Label({text: "No activity"});
        this.actor.set_child(this._text);

        Mainloop.timeout_add_seconds(1, Lang.bind(this, function() {
            this._hamster.GetCurrentFactRemote(Lang.bind(this, function(fact) {
                if(fact == null || !fact.name) {
                    this._text.set_text("No activity");
                    this.activityCategory.set_text("No activity");
                    this.startTrackingLabel.set_text("Start Tracking");
                    this.stop_item.actor.visible = false;
                    this.activity_category_item.actor.visible = false;
                    this.stop_separator.actor.visible = false;
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
                    
                    if (fact.category == '')
                        this.activityCategory.set_text(fact.name);
                    else
                        this.activityCategory.set_text(fact.name+" - "+fact.category);
                    this.startTrackingLabel.set_text("Change");
                    this.stop_item.actor.visible = true;
                    this.activity_category_item.actor.visible = true;
                    this.stop_separator.actor.visible = true;
                }
            }));
            return true;
        }));
    },

    _onButtonPress: function(actor, event) {
        this.menu.toggle();
    },

    _onSummary: function() {

    },

    _onPrefs: function() {

    },
};
