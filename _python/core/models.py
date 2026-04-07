import json
import logging
import os

from datetime import datetime
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

class Log():
    class LogType():
        EMPTY = "", "Empty"
        BUTTON_PRESS = 1000
        ERROR_GENERAL = 1500
        ERROR_TIME_VALIDATION = 1509
        KEY_PRESS = 500
        SCORE_ACTIVITY_FROM_CLIENT = "SCORE_ACTIVITY_FROM_CLIENT", "Client Score Activity"
        SCORE_FINAL_FROM_CLIENT = 1002
        SCORE_QUESTION_ANSWERED = 1004
        SCORE_WIDGET_INTERACTION = 1001
        SCORE_PARTICIPATION = 1006
        WIDGET_CORE_INIT = 7
        WIDGET_END = 2
        WIDGET_LOAD_DONE = "WIDGET_LOAD_DONE", "Finish Widget Load"
        WIDGET_LOAD_START = "WIDGET_LOAD_START", "Start Widget Load"
        WIDGET_LOGIN = 13
        WIDGET_PLAY_REQ = 8
        WIDGET_PLAY_START = 9
        WIDGET_RESTART = 4
        WIDGET_START = 1
        WIDGET_STATE = 15
        DATA = "DATA", "Data"

        @staticmethod
        def get_log_type(log_type_id: int) -> str:
            match log_type_id:
                case 1:
                    return Log.LogType.WIDGET_START
                case 2:
                    return Log.LogType.WIDGET_END
                case 4:
                    return Log.LogType.WIDGET_RESTART
                case 5:
                    # return Log.LogType.ASSET_LOADING
                    return Log.LogType.EMPTY
                case 6:
                    # return Log.LogType.ASSET_LOADED
                    return Log.LogType.EMPTY
                case 7:
                    # return Log.LogType.FRAMEWORK_INIT
                    return Log.LogType.WIDGET_CORE_INIT
                case 8:
                    # return Log.LogType.PLAY_REQUEST
                    return Log.LogType.WIDGET_PLAY_REQ
                case 9:
                    # return Log.LogType.PLAY_CREATED
                    return Log.LogType.WIDGET_PLAY_START
                case 13:
                    # return Log.LogType.LOG_IN
                    return Log.LogType.WIDGET_LOGIN
                case 15:
                    # return Log.LogType.WIDGET_STATE_CHANGE
                    return Log.LogType.WIDGET_STATE
                case 500:
                    return Log.LogType.KEY_PRESS
                case 1000:
                    return Log.LogType.BUTTON_PRESS
                case 1001:
                    # return Log.LogType.WIDGET_INTERACTION
                    return Log.LogType.SCORE_WIDGET_INTERACTION
                case 1002:
                    # return Log.LogType.FINAL_SCORE_FROM_CLIENT
                    return Log.LogType.SCORE_FINAL_FROM_CLIENT
                case 1004:
                    # return Log.LogType.QUESTION_ANSWERED
                    return Log.LogType.SCORE_QUESTION_ANSWERED
                case 1006:
                    return Log.LogType.SCORE_PARTICIPATION
                case 1008:
                    # return Log.LogType.SCORE_FEEDBACK
                    return Log.LogType.EMPTY
                case 1009:
                    # return Log.LogType.SCORE_ALERT
                    return Log.LogType.EMPTY
                case 1500:
                    return Log.LogType.ERROR_GENERAL
                case 1509:
                    return Log.LogType.ERROR_TIME_VALIDATION
                case 2000:
                    return Log.LogType.DATA
                case _:
                    return Log.LogType.EMPTY

    id=""
    play_id=""
    log_type=""
    item_id=""
    text=""
    value=""
    created_at=""
    game_time=""
    ip=""

    def __init__(self, input):
        self.id=""
        self.play_id=""
        self.log_type=input["type"]
        self.item_id=input["item_id"]
        self.text=input["text"]
        self.value=input["value"]
        self.created_at=datetime.now(ZoneInfo("America/New_York"))
        self.game_time=input["game_time"]
        self.ip=""

    @property
    def log_type_string(self):
        match self.log_type:
            case 1:
                return "WIDGET_START"
            case 2:
                return "WIDGET_END"
            case 4:
                return "WIDGET_RESTART"
            case 5:
                return "EMPTY"
            case 6:
                return "EMPTY"
            case 7:
                return "WIDGET_CORE_INIT"
            case 8:
                return "WIDGET_PLAY_REQ"
            case 9:
                return "WIDGET_PLAY_START"
            case 13:
                return "WIDGET_LOGIN"
            case 15:
                return "WIDGET_STATE"
            case 500:
                return "KEY_PRESS"
            case 1000:
                return "BUTTON_PRESS"
            case 1001:
                return "SCORE_WIDGET_INTERACTION"
            case 1002:
                return "SCORE_FINAL_FROM_CLIENT"
            case 1004:
                return "SCORE_QUESTION_ANSWERED"
            case 1006:
                return "SCORE_PARTICIPATION"
            case 1008:
                return "EMPTY"
            case 1009:
                return "EMPTY"
            case 1500:
                return "ERROR_GENERAL"
            case 1509:
                return "ERROR_TIME_VALIDATION"
            case 2000:
                return "DATA"
            case _:
                return "EMPTY"


class LogPlay():
    AUTH_CHOICES = [("", ""), ("lti", "lti")]

    id=""
    instance=None
    is_valid=""
    created_at=datetime.now(ZoneInfo("America/New_York"))
    user=""
    ip=""
    is_complete=""
    score=""
    score_possible=""
    percent=""
    elapsed=""
    qset=""
    auth=""
    lti_token=""
    referrer_url=""
    context_id=""
    semester=""

    def __init__(self, id, inst):
        self.id=id
        self.instance=inst
        self.is_valid=""
        self.created_at=datetime.now(ZoneInfo("America/New_York"))
        self.user=""
        self.ip=""
        self.is_complete=True
        self.score=""
        self.score_possible=""
        self.percent=""
        self.elapsed=""
        self.qset=None
        self.auth=""
        self.lti_token=""
        self.referrer_url=""
        self.context_id=""
        self.semester=""

        if self.instance:
            with open(f"/qsets/{self.instance.id}.json", "r") as file:
                data = json.load(file)
                self.qset = WidgetQset(self.instance, data)
            

    def get_logs(self):
        logs = []
        # revisit this if we ever get around to changing the hacky approach to
        #  persisting instance IDs and play IDs across the jank MWDK workflow
        with open(f"/qsets/{self.instance.id}--{self.id}-log.json", "r") as file:
            data = json.load(file)
            for log in data["logs"]:
                log_obj = Log(log)
                logs.append(log_obj)
            return logs

    def update_elapsed(self):
        now = datetime.now(ZoneInfo("America/New_York"))
        self.elapsed = (now - self.created_at).total_seconds()
        # self.save()

    def set_complete(self, score, possible, percent):
        self.is_complete = True
        self.is_valid = False
        self.score = score
        self.score_possible = possible
        self.percent = percent if percent <= 100 else 100
        # self.save()

class User():
    pass

class WidgetInstance():
    id=""
    widget=None
    user=""
    created_at=""
    name=""
    is_draft=""
    height=""
    width=""
    open_at=""
    close_at=""
    attempts=""
    is_deleted=""
    guest_access=""
    is_student_made=""
    updated_at=""
    embedded_only=""
    published_by=""
    permissions=""

    def __init__(self, id):
        # defaults        
        self.id=id
        # ideally this is built intelligently from the install.yaml file
        # perhaps in the Express code, after an instance of WidgetInstance exists?
        self.widget=None
        self.user=""
        self.created_at=""
        self.name=""
        self.is_draft=""
        self.height=""
        self.width=""
        self.open_at=""
        self.close_at=""
        self.attempts=""
        self.is_deleted=False
        self.guest_access=False
        self.is_student_made=False
        self.updated_at=""
        self.embedded_only=False
        self.published_by=None
        self.permissions=None

        with open(f"/qsets/{id}.instance.json", "r") as file:
            # Use json.load() to convert the file content to a Python object
            data = json.load(file)
            self.created_at=datetime.fromtimestamp(data["created_at"])
            self.name=data["name"]
            self.is_draft=data["is_draft"]
            self.height=data["height"]
            self.width=data["width"]
            self.open_at=data["open_at"]
            self.close_at=data["close_at"]
            self.attempts=data["attempts"]
            self.updated_at=self.created_at

            widget = Widget(data["widget"])
            self.widget = widget

    def user_has_attempts(self, user: User, context: str = ""):
        return True

class Widget():
    id=""
    name=""
    created_at=""
    flash_version=""
    height=""
    width=""
    is_scalable=""
    score_module=""
    score_type=""
    is_qset_encrypted=""
    is_answer_encrypted=""
    is_storage_enabled=""
    is_editable=""
    is_playable=""
    is_scorable=""
    in_catalog=""
    featured=""
    is_generable=""
    uses_prompt_generation=""
    creator=""
    clean_name=""
    player=""
    api_version=""
    package_hash=""
    score_screen=""
    restrict_publish=""
    creator_guide=""
    player_guide=""
    metadata=""

    def __init__(self, input=None):
        self.id=""
        self.name=""
        self.created_at=""
        self.flash_version=0
        self.height=0
        self.width=0
        self.is_scalable=True
        self.score_module=""
        self.score_type=""
        self.is_qset_encrypted=True
        self.is_answer_encrypted=True
        self.is_storage_enabled=True
        self.is_editable=True
        self.is_playable=True
        self.is_scorable=True
        self.in_catalog=True
        self.featured=True
        self.is_generable=True
        self.uses_prompt_generation=True
        self.creator=""
        self.clean_name=""
        self.player=""
        self.api_version=0
        self.package_hash=""
        self.score_screen=""
        self.restrict_publish=False
        self.creator_guide=""
        self.player_guide=""
        self.metadata=None

        if input is not None:
            self.name = input["general"]["name"]
            self.height = input["general"]["height"]
            self.width = input["general"]["width"]
            self.score_module = input["score"]["score_module"]

class WidgetQset():
    id=""
    instance=""
    created_at=""
    data=""
    version=""

    def __init__(self, instance, data):
        self.id=""
        self.instance=instance
        self.created_at=""
        self.data=data
        self.version=data["version"]

    def get_questions(self):
        def find_questions(source):
            questions = []

            if isinstance(source, list):
                for item in source:
                    if Question.is_question(item):
                        questions.append(item)
                    else:
                        questions += find_questions(item)

            elif isinstance(source, dict):
                if Question.is_question(source):
                    questions.append(source)
                else:
                    for key, value in source.items():
                        if Question.is_question(value):
                            questions.append(value)
                        else:
                            questions += find_questions(value)
            else:
                return []

            return questions

        questions = find_questions(self.data)
        questions_set = []
        for question in questions:
            new_question = Question(
                type=self.instance.widget,
                data=question,
                qset=self,
                item_id=question["id"] if question.get("id", None) is not None else "",
            )
            questions_set.append(new_question)

        return questions_set
    
    @staticmethod
    def find_item_with_id(decoded, item_id):
        import copy

        def _process_item(item):
            if isinstance(item, list):
                for element in item:
                    result = _process_item(element)
                    if result is not None:
                        return result

            elif isinstance(item, dict):
                copied_item = copy.deepcopy(item)

                if Question.is_question(copied_item):
                    if copied_item.get("id") == item_id:
                        return copied_item

                for value in copied_item.values():
                    if isinstance(value, (dict, list)):
                        result = _process_item(value)
                        if result is not None:
                            return result
            return None

        return _process_item(decoded)

class Question():
    id=""
    qset=""
    data=""
    item_id=""
    created_at=""
    type=""

    def __init__(self,type,data,qset,item_id):
        self.type=type
        self.qset=qset
        self.item_id=item_id
        self.data=data

    @staticmethod
    def is_question(item):
        # Convert item to a dictionary if it's not already
        if not isinstance(item, dict):
            try:
                item = dict(item)
            except (TypeError, ValueError):
                return False

        # Check if required keys exist
        if "id" not in item:
            return False
        if "type" not in item:
            return False
        if "questions" not in item:
            return False
        if "answers" not in item:
            return False

        # Check if values are not empty
        # In some rare cases an empty answers array is acceptable, as with Adventure
        if not item["type"] or not item["questions"]:
            return False

        # Check if questions and answers are lists
        if not isinstance(item["answers"], list):
            return False
        if not isinstance(item["questions"], list):
            return False

        return True
